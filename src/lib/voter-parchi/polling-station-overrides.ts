import type { Db } from 'mongodb';
import {
  canonicalPollingBlockcode,
  electoralRollBlockCodesForLookup,
  pollingBlockcodeLookupVariants,
} from '@/lib/polling-scheme/blockcode-lookup';

const COLLECTION = 'voter_parchi_polling_station_overrides';

function normalizeHalka(halkaName: string): string {
  return halkaName.replace(/\s+/g, '').toUpperCase();
}

export function normalizePollingOverrideBlockKey(blockCode: string): string {
  const digits = String(blockCode ?? '').replace(/\D/g, '');
  if (!digits) return String(blockCode ?? '').trim();
  if (digits.length <= 7) return digits.padStart(7, '0');
  return digits;
}

function halkaFilter(halkaName: string): Record<string, unknown> {
  const normalized = normalizeHalka(halkaName);
  const trimmed = halkaName.trim();
  return normalized === trimmed ? { halkaName: normalized } : { halkaName: { $in: [normalized, trimmed] } };
}

export interface PollingStationOverrideRecord {
  halkaName: string;
  blockCode: string;
  normalizedBlockCode: string;
  canonicalBlockCode: number | null;
  pollingStation: string;
  updatedAt: Date;
  updatedBy?: string | null;
  updatedByName?: string | null;
}

export async function getPollingStationOverride(
  db: Db,
  halkaName: string,
  blockCode: string
): Promise<string> {
  const normalizedBlockCode = normalizePollingOverrideBlockKey(blockCode);
  const canonicalBlockCode = canonicalPollingBlockcode(blockCode);
  const variants = new Set<string>([
    normalizedBlockCode,
    ...electoralRollBlockCodesForLookup(blockCode).map((value) =>
      normalizePollingOverrideBlockKey(String(value))
    ),
    ...pollingBlockcodeLookupVariants(blockCode).map((value) => normalizePollingOverrideBlockKey(String(value))),
  ]);

  const doc = await db.collection(COLLECTION).findOne({
    ...halkaFilter(halkaName),
    $or: [
      { normalizedBlockCode: { $in: Array.from(variants) } },
      ...(canonicalBlockCode ? [{ canonicalBlockCode }] : []),
      { blockCode: { $in: Array.from(variants) } },
    ],
  });

  return String(doc?.pollingStation ?? '').trim();
}

export async function upsertPollingStationOverride(
  db: Db,
  input: {
    halkaName: string;
    blockCode: string;
    pollingStation: string;
    updatedBy?: string | null;
    updatedByName?: string | null;
  }
): Promise<PollingStationOverrideRecord> {
  const halkaName = normalizeHalka(input.halkaName);
  const normalizedBlockCode = normalizePollingOverrideBlockKey(input.blockCode);
  const canonicalBlockCode = canonicalPollingBlockcode(input.blockCode);
  const pollingStation = String(input.pollingStation ?? '').trim();
  if (!pollingStation) {
    throw new Error('Polling station is required.');
  }

  const doc: PollingStationOverrideRecord = {
    halkaName,
    blockCode: String(input.blockCode ?? '').trim(),
    normalizedBlockCode,
    canonicalBlockCode,
    pollingStation,
    updatedAt: new Date(),
    updatedBy: input.updatedBy?.trim() || null,
    updatedByName: input.updatedByName?.trim() || null,
  };

  await db.collection(COLLECTION).updateOne(
    {
      halkaName,
      normalizedBlockCode,
    },
    { $set: doc },
    { upsert: true }
  );

  return doc;
}

export async function listCoveredPollingStationBlockKeys(
  db: Db,
  halkaName: string,
  blockCodes: string[]
): Promise<Set<string>> {
  const coveredRequested = new Set<string>();
  const normalizedHalka = normalizeHalka(halkaName);
  const requestedCodes = blockCodes.map((blockCode) => ({
    raw: blockCode,
    normalized: normalizePollingOverrideBlockKey(blockCode),
    lookupKeys: new Set(
      [
        blockCode,
        ...electoralRollBlockCodesForLookup(blockCode).map((value) => String(value)),
        ...pollingBlockcodeLookupVariants(blockCode).map((value) => String(value)),
      ].map((value) => normalizePollingOverrideBlockKey(value))
    ),
  }));

  if (requestedCodes.length === 0) {
    return coveredRequested;
  }

  const pollingDocs = await db
    .collection('polling_scheme')
    .find(
      {
        ...halkaFilter(normalizedHalka),
        blockcode: {
          $in: Array.from(
            new Set(
              blockCodes.flatMap((blockCode) =>
                electoralRollBlockCodesForLookup(blockCode).map((value) => {
                  const asString = String(value);
                  return /^\d+$/.test(asString) ? Number(asString) : asString;
                })
              )
            )
          ),
        },
      },
      {
        projection: {
          blockcode: 1,
          polling_station_name: 1,
          sourceRawText: 1,
        },
      }
    )
    .toArray();

  const coveredLookupKeys = new Set<string>();
  for (const doc of pollingDocs) {
    const station = String(doc.polling_station_name ?? '').trim() || String(doc.sourceRawText ?? '').trim();
    if (!station) continue;
    const key = normalizePollingOverrideBlockKey(String(doc.blockcode ?? ''));
    if (key) {
      coveredLookupKeys.add(key);
    }
  }

  const overrideDocs = await db
    .collection(COLLECTION)
    .find(
      {
        halkaName: normalizedHalka,
        normalizedBlockCode: {
          $in: Array.from(new Set(requestedCodes.flatMap((item) => Array.from(item.lookupKeys)))),
        },
      },
      { projection: { normalizedBlockCode: 1, pollingStation: 1 } }
    )
    .toArray();

  for (const doc of overrideDocs) {
    if (!String(doc.pollingStation ?? '').trim()) continue;
    const key = normalizePollingOverrideBlockKey(String(doc.normalizedBlockCode ?? ''));
    if (key) {
      coveredLookupKeys.add(key);
    }
  }

  for (const requested of requestedCodes) {
    if (Array.from(requested.lookupKeys).some((key) => coveredLookupKeys.has(key))) {
      coveredRequested.add(requested.normalized);
    }
  }

  return coveredRequested;
}
