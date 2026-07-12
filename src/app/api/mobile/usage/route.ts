import { NextResponse } from 'next/server';
import { connectNativeMongoClient, getVdpDb } from '@/lib/mongo-client';
import { resolveMobileSession } from '@/lib/mobile/auth';
import {
  MOBILE_USAGE_EVENT_TYPES,
  recordMobileUsageEvents,
  type MobileUsageEventInput,
} from '@/lib/mobile/usage';

export const dynamic = 'force-dynamic';

function isValidEventType(value: unknown): value is MobileUsageEventInput['eventType'] {
  return typeof value === 'string' && MOBILE_USAGE_EVENT_TYPES.includes(value as MobileUsageEventInput['eventType']);
}

function normalizeEvents(body: unknown): MobileUsageEventInput[] {
  const payload = body as { events?: unknown; eventType?: unknown };
  const rawEvents = Array.isArray(payload?.events)
    ? payload.events
    : payload?.eventType
      ? [payload]
      : [];

  const events: MobileUsageEventInput[] = [];
  for (const item of rawEvents) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    if (!isValidEventType(row.eventType)) continue;

    const location =
      row.location && typeof row.location === 'object'
        ? (row.location as MobileUsageEventInput['location'])
        : null;

    events.push({
      eventType: row.eventType,
      clientTimestamp: typeof row.clientTimestamp === 'string' ? row.clientTimestamp : null,
      location,
      metadata:
        row.metadata && typeof row.metadata === 'object'
          ? (row.metadata as Record<string, unknown>)
          : {},
    });
  }
  return events;
}

export async function POST(request: Request) {
  const client = await connectNativeMongoClient();
  const db = getVdpDb(client);

  try {
    const session = await resolveMobileSession(request, db);
    if (!session || session.type !== 'user' || !session.halkaName) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const events = normalizeEvents(body);
    if (events.length === 0) {
      return NextResponse.json({ error: 'No valid usage events' }, { status: 400 });
    }

    const accessLabel =
      typeof (body as { accessLabel?: unknown }).accessLabel === 'string'
        ? (body as { accessLabel: string }).accessLabel
        : null;

    const recorded = await recordMobileUsageEvents(db, session, events, accessLabel);
    return NextResponse.json({ ok: true, recorded });
  } catch (error) {
    console.error('Record mobile usage failed:', error);
    return NextResponse.json({ error: 'Failed to record usage' }, { status: 500 });
  } finally {
    await client.close();
  }
}
