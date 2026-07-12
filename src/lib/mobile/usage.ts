import type { Db } from 'mongodb';
import type { MobileSession } from '@/lib/mobile/types';

export const MOBILE_USAGE_EVENT_TYPES = [
  'login',
  'login_failed',
  'logout',
  'session_restore',
  'search',
  'clear_search',
  'view_voter',
  'share_voter',
  'open_parchi',
  'download_parchi',
  'print_parchi',
  'download_block_start',
  'download_block_pause',
  'download_block_cancel',
  'download_block_failed',
  'download_block',
  'delete_block',
  'mode_change',
  'select_block',
  'tab_open',
] as const;

export type MobileUsageEventType = (typeof MOBILE_USAGE_EVENT_TYPES)[number];

export const PUBLIC_MOBILE_USAGE_EVENT_TYPES = ['login_failed'] as const;

export interface MobileUsageLocationInput {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  altitude?: number | null;
  heading?: number | null;
  speed?: number | null;
}

export interface MobileUsageClientContext {
  platform?: string | null;
  appVersion?: string | null;
  buildNumber?: string | null;
  deviceModel?: string | null;
  osVersion?: string | null;
  workMode?: string | null;
  isOnline?: boolean | null;
  selectedBlock?: string | null;
}

export interface MobileUsageRequestContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface MobileUsageEventInput {
  eventType: MobileUsageEventType;
  clientTimestamp?: string | null;
  location?: MobileUsageLocationInput | null;
  metadata?: Record<string, unknown>;
}

export interface MobileUsageEventRecord {
  _id: string;
  sessionId?: string | null;
  accessCode?: string | null;
  accessLabel?: string | null;
  halkaName?: string | null;
  eventType: MobileUsageEventType;
  timestamp: string;
  clientTimestamp?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  locationAccuracy?: number | null;
  locationAltitude?: number | null;
  client?: MobileUsageClientContext | null;
  request?: MobileUsageRequestContext | null;
  metadata: Record<string, unknown>;
}

export interface MobileUsageSummary {
  totalEvents: number;
  uniqueAccessCodes: number;
  byEventType: Record<string, number>;
  byAccessCode: Array<{ accessCode: string; count: number; label?: string | null }>;
  byHalkaName: Array<{ halkaName: string; count: number }>;
  latestEventAt?: string | null;
}

function parseClientTimestamp(value?: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeLocation(location?: MobileUsageLocationInput | null) {
  if (!location) return null;
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const toOptionalNumber = (value?: number | null) => {
    if (value == null || Number.isNaN(Number(value))) return null;
    return Number(value);
  };

  return {
    type: 'Point' as const,
    coordinates: [longitude, latitude] as [number, number],
    accuracy: toOptionalNumber(location.accuracy),
    altitude: toOptionalNumber(location.altitude),
    heading: toOptionalNumber(location.heading),
    speed: toOptionalNumber(location.speed),
  };
}

function normalizeClientContext(client?: MobileUsageClientContext | null): MobileUsageClientContext | null {
  if (!client) return null;
  return {
    platform: client.platform ?? null,
    appVersion: client.appVersion ?? null,
    buildNumber: client.buildNumber ?? null,
    deviceModel: client.deviceModel ?? null,
    osVersion: client.osVersion ?? null,
    workMode: client.workMode ?? null,
    isOnline: client.isOnline ?? null,
    selectedBlock: client.selectedBlock ?? null,
  };
}

function buildUsageDoc(
  event: MobileUsageEventInput,
  context: {
    sessionId?: string | null;
    accessCode?: string | null;
    accessLabel?: string | null;
    halkaName?: string | null;
    client?: MobileUsageClientContext | null;
    request?: MobileUsageRequestContext | null;
    timestamp?: Date;
  },
) {
  const now = context.timestamp ?? new Date();
  return {
    sessionId: context.sessionId ?? null,
    accessCode: context.accessCode ?? null,
    accessLabel: context.accessLabel ?? null,
    halkaName: context.halkaName ?? null,
    eventType: event.eventType,
    timestamp: now,
    clientTimestamp: parseClientTimestamp(event.clientTimestamp),
    location: normalizeLocation(event.location),
    client: normalizeClientContext(context.client),
    request: context.request
      ? {
          ipAddress: context.request.ipAddress ?? null,
          userAgent: context.request.userAgent ?? null,
        }
      : null,
    metadata: event.metadata ?? {},
  };
}

export async function recordMobileUsageEvents(
  db: Db,
  session: MobileSession,
  events: MobileUsageEventInput[],
  options?: {
    accessLabel?: string | null;
    client?: MobileUsageClientContext | null;
    request?: MobileUsageRequestContext | null;
  },
): Promise<number> {
  if (events.length === 0) return 0;

  const docs = events.map((event) =>
    buildUsageDoc(event, {
      sessionId: session._id?.toString() ?? null,
      accessCode: session.accessCode ?? null,
      accessLabel: options?.accessLabel ?? null,
      halkaName: session.halkaName ?? null,
      client: options?.client,
      request: options?.request,
    }),
  );

  const result = await db.collection('mobile_usage_events').insertMany(docs);
  return result.insertedCount;
}

export async function recordPublicMobileUsageEvents(
  db: Db,
  events: MobileUsageEventInput[],
  options?: {
    accessCodeAttempt?: string | null;
    client?: MobileUsageClientContext | null;
    request?: MobileUsageRequestContext | null;
  },
): Promise<number> {
  if (events.length === 0) return 0;

  const docs = events.map((event) =>
    buildUsageDoc(event, {
      accessCode: options?.accessCodeAttempt ?? null,
      client: options?.client,
      request: options?.request,
    }),
  );

  const result = await db.collection('mobile_usage_events').insertMany(docs);
  return result.insertedCount;
}

export async function listMobileUsageEvents(
  db: Db,
  filters: {
    halkaName?: string;
    accessCode?: string;
    eventType?: string;
    limit?: number;
    since?: Date;
    until?: Date;
  },
): Promise<MobileUsageEventRecord[]> {
  const query: Record<string, unknown> = {};
  if (filters.halkaName) query.halkaName = filters.halkaName;
  if (filters.accessCode) query.accessCode = filters.accessCode;
  if (filters.eventType) query.eventType = filters.eventType;

  if (filters.since || filters.until) {
    query.timestamp = {};
    if (filters.since) (query.timestamp as Record<string, Date>).$gte = filters.since;
    if (filters.until) (query.timestamp as Record<string, Date>).$lte = filters.until;
  }

  const rows = await db
    .collection('mobile_usage_events')
    .find(query)
    .sort({ timestamp: -1 })
    .limit(Math.min(Math.max(filters.limit ?? 200, 1), 1000))
    .toArray();

  return rows.map(mapUsageRow);
}

export async function getMobileUsageSummary(
  db: Db,
  filters: {
    halkaName?: string;
    accessCode?: string;
    since?: Date;
    until?: Date;
  },
): Promise<MobileUsageSummary> {
  const match: Record<string, unknown> = {};
  if (filters.halkaName) match.halkaName = filters.halkaName;
  if (filters.accessCode) match.accessCode = filters.accessCode;
  if (filters.since || filters.until) {
    match.timestamp = {};
    if (filters.since) (match.timestamp as Record<string, Date>).$gte = filters.since;
    if (filters.until) (match.timestamp as Record<string, Date>).$lte = filters.until;
  }

  const [stats] = await db
    .collection('mobile_usage_events')
    .aggregate([
      { $match: match },
      {
        $facet: {
          totals: [{ $count: 'count' }],
          byEventType: [{ $group: { _id: '$eventType', count: { $sum: 1 } } }],
          byAccessCode: [
            { $match: { accessCode: { $type: 'string', $ne: '' } } },
            {
              $group: {
                _id: '$accessCode',
                count: { $sum: 1 },
                label: { $last: '$accessLabel' },
              },
            },
            { $sort: { count: -1 } },
            { $limit: 20 },
          ],
          byHalkaName: [
            { $match: { halkaName: { $type: 'string', $ne: '' } } },
            { $group: { _id: '$halkaName', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 20 },
          ],
          uniqueCodes: [{ $match: { accessCode: { $type: 'string', $ne: '' } } }, { $group: { _id: '$accessCode' } }],
          latest: [{ $sort: { timestamp: -1 } }, { $limit: 1 }, { $project: { timestamp: 1 } }],
        },
      },
    ])
    .toArray();

  const facet = stats ?? {};
  const totalEvents = facet.totals?.[0]?.count ?? 0;
  const byEventType: Record<string, number> = {};
  for (const row of facet.byEventType ?? []) {
    byEventType[String(row._id)] = row.count as number;
  }

  return {
    totalEvents,
    uniqueAccessCodes: (facet.uniqueCodes ?? []).length,
    byEventType,
    byAccessCode: (facet.byAccessCode ?? []).map((row: { _id: string; count: number; label?: string }) => ({
      accessCode: String(row._id),
      count: row.count,
      label: row.label ?? null,
    })),
    byHalkaName: (facet.byHalkaName ?? []).map((row: { _id: string; count: number }) => ({
      halkaName: String(row._id),
      count: row.count,
    })),
    latestEventAt:
      facet.latest?.[0]?.timestamp instanceof Date
        ? facet.latest[0].timestamp.toISOString()
        : facet.latest?.[0]?.timestamp
          ? String(facet.latest[0].timestamp)
          : null,
  };
}

function mapUsageRow(row: Record<string, unknown>): MobileUsageEventRecord {
  const client = row.client as MobileUsageClientContext | null | undefined;
  const request = row.request as MobileUsageRequestContext | null | undefined;
  const location = row.location as
    | {
        coordinates?: number[];
        accuracy?: number | null;
        altitude?: number | null;
      }
    | null
    | undefined;

  return {
    _id: String(row._id),
    sessionId: (row.sessionId as string | null | undefined) ?? null,
    accessCode: (row.accessCode as string | null | undefined) ?? null,
    accessLabel: (row.accessLabel as string | null | undefined) ?? null,
    halkaName: (row.halkaName as string | null | undefined) ?? null,
    eventType: row.eventType as MobileUsageEventType,
    timestamp: row.timestamp instanceof Date ? row.timestamp.toISOString() : String(row.timestamp),
    clientTimestamp:
      row.clientTimestamp instanceof Date
        ? row.clientTimestamp.toISOString()
        : row.clientTimestamp
          ? String(row.clientTimestamp)
          : null,
    latitude: location?.coordinates?.[1] ?? null,
    longitude: location?.coordinates?.[0] ?? null,
    locationAccuracy: location?.accuracy ?? null,
    locationAltitude: location?.altitude ?? null,
    client: client ?? null,
    request: request ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  };
}

export function extractRequestContext(request: Request): MobileUsageRequestContext {
  const forwarded = request.headers.get('x-forwarded-for');
  const ipAddress = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || null;
  return {
    ipAddress,
    userAgent: request.headers.get('user-agent'),
  };
}
