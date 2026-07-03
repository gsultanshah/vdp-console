import dns from 'node:dns';
import dnsPromises from 'node:dns/promises';
import { MongoClient, ObjectId, type Db, type MongoClientOptions } from 'mongodb';

export { MongoClient, ObjectId, type Db, type MongoClientOptions };

let configured = false;

interface MongoUriCache {
  sourceUri: string;
  directUri: string;
}

declare global {
  // eslint-disable-next-line no-var
  var mongoUriCache: MongoUriCache | undefined;
  // eslint-disable-next-line no-var
  var mongoUriResolvePromise: Promise<string> | undefined;
}

function sanitizeMongoUri(uri: string): string {
  let value = uri.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return value;
}

export function clearMongoUriCache(): void {
  global.mongoUriCache = undefined;
  global.mongoUriResolvePromise = undefined;
}

/** Prefer public DNS for Atlas SRV resolution when system DNS is flaky. */
export function configureMongoDns(): void {
  if (configured || process.env.MONGODB_USE_SYSTEM_DNS === 'true') {
    return;
  }

  configured = true;
  const custom = process.env.MONGODB_DNS_SERVERS?.split(',')
    .map((server) => server.trim())
    .filter(Boolean);

  const servers = custom?.length ? custom : ['8.8.8.8', '1.1.1.1', '8.8.4.4'];
  dns.setServers(servers);
  patchAtlasDnsLookup(servers);
}

async function withDnsRetry<T>(label: string, fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const retryable =
        message.includes('ESERVFAIL') ||
        message.includes('ENOTFOUND') ||
        message.includes('ETIMEOUT') ||
        message.includes('ECONNREFUSED');

      if (!retryable || attempt === attempts) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    }
  }

  throw lastError;
}

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | dns.LookupAddress[],
  family: number
) => void;

const originalLookup = dns.lookup;

function patchAtlasDnsLookup(servers: string[]): void {
  dns.lookup = (
    hostname: string,
    options: number | dns.LookupOptions | LookupCallback,
    callback?: LookupCallback
  ) => {
    let opts: dns.LookupOptions = {};
    let cb = callback;

    if (typeof options === 'function') {
      cb = options;
    } else if (typeof options === 'number') {
      opts = { family: options };
    } else if (options) {
      opts = options;
    }

    if (!cb) {
      throw new Error('dns.lookup callback is required');
    }

    const host = String(hostname);
    const isAtlasHost =
      host.endsWith('.mongodb.net') || host.startsWith('_mongodb._tcp.');

    if (!isAtlasHost) {
      return originalLookup.call(dns, hostname, opts, cb);
    }

    const prevServers = dns.getServers();
    dns.setServers(servers);

    const finish = (err: NodeJS.ErrnoException | null, address?: string, family?: number) => {
      dns.setServers(prevServers);
      if (err) {
        cb(err, '', 4);
        return;
      }
      cb(null, address ?? '', family ?? 4);
    };

    const wantsAll = typeof opts === 'object' && 'all' in opts && opts.all === true;
    const family = typeof opts === 'object' && 'family' in opts ? opts.family : undefined;

    const lookupPromise =
      family === 6
        ? dnsPromises.resolve6(host)
        : family === 4
          ? dnsPromises.resolve4(host)
          : Promise.all([
              dnsPromises.resolve4(host).catch(() => [] as string[]),
              dnsPromises.resolve6(host).catch(() => [] as string[]),
            ]).then(([v4, v6]) => [...v4, ...v6]);

    void Promise.resolve(lookupPromise)
      .then((addresses) => {
        const list = Array.isArray(addresses) ? addresses : [addresses];
        if (!list.length) {
          finish(
            Object.assign(new Error(`queryA ENOTFOUND ${host}`), {
              code: 'ENOTFOUND',
              syscall: 'queryA',
              hostname: host,
            })
          );
          return;
        }

        if (wantsAll) {
          const entries = list.map((address) => ({
            address,
            family: address.includes(':') ? 6 : 4,
          }));
          dns.setServers(prevServers);
          cb(null, entries);
          return;
        }

        const address = list[0];
        finish(null, address, address.includes(':') ? 6 : 4);
      })
      .catch((error: NodeJS.ErrnoException) => finish(error));
  };
}

interface ParsedSrvUri {
  username: string;
  password: string;
  host: string;
  database: string;
  options: URLSearchParams;
}

function parseMongoSrvUri(uri: string): ParsedSrvUri | null {
  if (!uri.startsWith('mongodb+srv://')) {
    return null;
  }

  const rest = uri.slice('mongodb+srv://'.length);
  const credEnd = rest.indexOf('@');
  if (credEnd === -1) {
    return null;
  }

  const creds = rest.slice(0, credEnd);
  const afterAt = rest.slice(credEnd + 1);
  const slash = afterAt.indexOf('/');
  const queryStart = afterAt.indexOf('?');

  let host = '';
  let database = '';
  let query = '';

  if (slash === -1) {
    host = queryStart === -1 ? afterAt : afterAt.slice(0, queryStart);
    query = queryStart === -1 ? '' : afterAt.slice(queryStart + 1);
  } else {
    host = afterAt.slice(0, slash);
    const pathAndQuery = afterAt.slice(slash + 1);
    const pathQueryStart = pathAndQuery.indexOf('?');
    if (pathQueryStart === -1) {
      database = pathAndQuery;
    } else {
      database = pathAndQuery.slice(0, pathQueryStart);
      query = pathAndQuery.slice(pathQueryStart + 1);
    }
  }

  const colon = creds.indexOf(':');
  if (colon === -1) {
    return null;
  }

  return {
    username: decodeURIComponent(creds.slice(0, colon)),
    password: decodeURIComponent(creds.slice(colon + 1)),
    host,
    database,
    options: new URLSearchParams(query),
  };
}

async function buildDirectMongoUri(uri: string): Promise<string> {
  configureMongoDns();

  const parsed = parseMongoSrvUri(uri);
  if (!parsed) {
    return uri;
  }

  const srvRecords = await withDnsRetry('resolveSrv', () =>
    dnsPromises.resolveSrv(`_mongodb._tcp.${parsed.host}`)
  );
  if (!srvRecords.length) {
    throw new Error(`No SRV records found for MongoDB host ${parsed.host}`);
  }

  const hosts = srvRecords
    .sort((a, b) => a.priority - b.priority || b.weight - a.weight)
    .map((record) => `${record.name}:${record.port}`)
    .join(',');

  const params = new URLSearchParams(parsed.options.toString());
  if (!params.has('ssl') && !params.has('tls')) {
    params.set('ssl', 'true');
  }

  try {
    const txtRecords = await dnsPromises.resolveTxt(parsed.host);
    for (const record of txtRecords) {
      const txt = record.join('');
      for (const part of txt.split('&')) {
        const eq = part.indexOf('=');
        if (eq === -1) {
          continue;
        }
        const key = part.slice(0, eq);
        const value = part.slice(eq + 1);
        if (key && value && !params.has(key)) {
          params.set(key, value);
        }
      }
    }
  } catch {
    // TXT records are optional for Atlas
  }

  if (!params.has('authSource')) {
    params.set('authSource', 'admin');
  }

  const auth = `${encodeURIComponent(parsed.username)}:${encodeURIComponent(parsed.password)}`;
  const dbPath = parsed.database ? `/${parsed.database}` : '';
  const query = params.toString();
  return `mongodb://${auth}@${hosts}${dbPath}${query ? `?${query}` : ''}`;
}

/** Resolve mongodb+srv to a direct mongodb:// URI using configured DNS servers. */
export async function resolveMongoSrvUri(uri: string): Promise<string> {
  const sourceUri = sanitizeMongoUri(uri);
  if (!sourceUri.startsWith('mongodb+srv://')) {
    return sourceUri;
  }

  const cached = global.mongoUriCache;
  if (cached?.sourceUri === sourceUri) {
    return cached.directUri;
  }

  if (global.mongoUriResolvePromise) {
    return global.mongoUriResolvePromise;
  }

  global.mongoUriResolvePromise = buildDirectMongoUri(sourceUri)
    .then((directUri) => {
      global.mongoUriCache = { sourceUri, directUri };
      return directUri;
    })
    .finally(() => {
      global.mongoUriResolvePromise = undefined;
    });

  return global.mongoUriResolvePromise;
}

const DEFAULT_OPTIONS: MongoClientOptions = {
  serverSelectionTimeoutMS: 30_000,
  connectTimeoutMS: 30_000,
  socketTimeoutMS: 120_000,
  autoSelectFamily: false,
};

export function getMongoUri(): string {
  const uri = process.env.NEXT_PUBLIC_MONGODB_URI;
  if (!uri) {
    throw new Error('NEXT_PUBLIC_MONGODB_URI is not set in .env');
  }
  return sanitizeMongoUri(uri);
}

export async function getResolvedMongoUri(): Promise<string> {
  const uri = getMongoUri();
  if (uri.startsWith('mongodb+srv://')) {
    return resolveMongoSrvUri(uri);
  }
  return uri;
}

export function createMongoClient(uri?: string, options?: MongoClientOptions): MongoClient {
  return new MongoClient(uri ?? getMongoUri(), {
    ...DEFAULT_OPTIONS,
    ...options,
  });
}

export async function connectNativeMongoClient(
  options?: MongoClientOptions
): Promise<MongoClient> {
  configureMongoDns();
  const uri = await getResolvedMongoUri();
  const client = createMongoClient(uri, options);

  try {
    await client.connect();
    return client;
  } catch (error) {
    await client.close().catch(() => undefined);
    throw new Error(formatMongoConnectionError(error));
  }
}

export function formatMongoConnectionError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (
    lower.includes('eservfail') ||
    lower.includes('enotfound') ||
    lower.includes('querysrv') ||
    lower.includes('getaddrinfo')
  ) {
    return [
      'MongoDB DNS lookup failed — cannot resolve Atlas host.',
      `Details: ${message}`,
      '',
      'Try:',
      '  • Check internet / VPN connection',
      '  • Switch DNS to 8.8.8.8 or 1.1.1.1 in System Settings',
      '  • Set MONGODB_DNS_SERVERS=8.8.8.8,1.1.1.1 in .env',
      '  • Use a standard mongodb:// connection string from Atlas (Connect → Drivers)',
    ].join('\n');
  }

  return message;
}

export async function connectMongoDb(dbName = 'vdp'): Promise<{ client: MongoClient; db: Db }> {
  configureMongoDns();
  const uri = await getResolvedMongoUri();
  const client = createMongoClient(uri);

  try {
    await client.connect();
    return { client, db: client.db(dbName) };
  } catch (error) {
    await client.close().catch(() => undefined);
    throw new Error(formatMongoConnectionError(error));
  }
}

if (typeof window === 'undefined' && process.env.MONGODB_USE_SYSTEM_DNS !== 'true') {
  configureMongoDns();
}
