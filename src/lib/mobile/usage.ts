import type { Db } from 'mongodb';
import type { MobileSession } from '@/lib/mobile/types';

export const MOBILE_USAGE_EVENT_TYPES = [
  'login',
  'logout',
  'search',
  'share_voter',
  'open_parchi',
  'download_parchi',
  'download_block',
  'mode_change',
  'select_block',
] as const;

export type MobileUsageEventType = (typeof MOBILE_USAGE_EVENT_TYPES)[number];

export interface MobileUsageLocationInput {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
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
  metadata: Record<string, unknown>;
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
  return {
    type: 'Point' as const,
    coordinates: [longitude, latitude] as [number, number],
    accuracy:
      location.accuracy == null || Number.isNaN(Number(location.accuracy))
        ? null
        : Number(location.accuracy),
  };
}

export async function recordMobileUsageEvents(
  db: Db,
  session: MobileSession,
  events: MobileUsageEventInput[],
  accessLabel?: string | null,
): Promise<number> {
  if (events.length === 0) return 0;

  const now = new Date();
  const docs = events.map((event) => ({
    sessionId: session._id?.toString() ?? null,
    accessCode: session.accessCode ?? null,
    accessLabel: accessLabel ?? null,
    halkaName: session.halkaName ?? null,
    eventType: event.eventType,
    timestamp: now,
    clientTimestamp: parseClientTimestamp(event.clientTimestamp),
    location: normalizeLocation(event.location),
    metadata: event.metadata ?? {},
  }));

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
  },
): Promise<MobileUsageEventRecord[]> {
  const query: Record<string, unknown> = {};
  if (filters.halkaName) query.halkaName = filters.halkaName;
  if (filters.accessCode) query.accessCode = filters.accessCode;
  if (filters.eventType) query.eventType = filters.eventType;
  if (filters.since) query.timestamp = { $gte: filters.since };

  const rows = await db
    .collection('mobile_usage_events')
    .find(query)
    .sort({ timestamp: -1 })
    .limit(Math.min(Math.max(filters.limit ?? 200, 1), 1000))
    .toArray();

  return rows.map((row) => ({
    _id: String(row._id),
    sessionId: row.sessionId ?? null,
    accessCode: row.accessCode ?? null,
    accessLabel: row.accessLabel ?? null,
    halkaName: row.halkaName ?? null,
    eventType: row.eventType as MobileUsageEventType,
    timestamp: row.timestamp instanceof Date ? row.timestamp.toISOString() : String(row.timestamp),
    clientTimestamp:
      row.clientTimestamp instanceof Date
        ? row.clientTimestamp.toISOString()
        : row.clientTimestamp
          ? String(row.clientTimestamp)
          : null,
    latitude: row.location?.coordinates?.[1] ?? null,
    longitude: row.location?.coordinates?.[0] ?? null,
    locationAccuracy: row.location?.accuracy ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  }));
}
