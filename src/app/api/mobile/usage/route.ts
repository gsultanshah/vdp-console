import { NextResponse } from 'next/server';
import { connectNativeMongoClient, getVdpDb } from '@/lib/mongo-client';
import { resolveMobileSession } from '@/lib/mobile/auth';
import {
  extractRequestContext,
  MOBILE_USAGE_EVENT_TYPES,
  PUBLIC_MOBILE_USAGE_EVENT_TYPES,
  recordMobileUsageEvents,
  recordPublicMobileUsageEvents,
  type MobileUsageClientContext,
  type MobileUsageEventInput,
} from '@/lib/mobile/usage';

export const dynamic = 'force-dynamic';

function isValidEventType(value: unknown): value is MobileUsageEventInput['eventType'] {
  return typeof value === 'string' && MOBILE_USAGE_EVENT_TYPES.includes(value as MobileUsageEventInput['eventType']);
}

function normalizeClientContext(body: unknown): MobileUsageClientContext | null {
  if (!body || typeof body !== 'object') return null;
  const client = (body as { client?: unknown }).client;
  if (!client || typeof client !== 'object') return null;
  const row = client as Record<string, unknown>;
  return {
    platform: typeof row.platform === 'string' ? row.platform : null,
    appVersion: typeof row.appVersion === 'string' ? row.appVersion : null,
    buildNumber: typeof row.buildNumber === 'string' ? row.buildNumber : null,
    deviceModel: typeof row.deviceModel === 'string' ? row.deviceModel : null,
    osVersion: typeof row.osVersion === 'string' ? row.osVersion : null,
    workMode: typeof row.workMode === 'string' ? row.workMode : null,
    isOnline: typeof row.isOnline === 'boolean' ? row.isOnline : null,
    selectedBlock: typeof row.selectedBlock === 'string' ? row.selectedBlock : null,
  };
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
    const body = await request.json();
    const events = normalizeEvents(body);
    if (events.length === 0) {
      return NextResponse.json({ error: 'No valid usage events' }, { status: 400 });
    }

    const requestContext = extractRequestContext(request);
    const clientContext = normalizeClientContext(body);
    const accessLabel =
      typeof (body as { accessLabel?: unknown }).accessLabel === 'string'
        ? (body as { accessLabel: string }).accessLabel
        : null;

    const session = await resolveMobileSession(request, db);
    if (session && session.type === 'user' && session.halkaName) {
      const recorded = await recordMobileUsageEvents(db, session, events, {
        accessLabel,
        client: clientContext,
        request: requestContext,
      });
      return NextResponse.json({ ok: true, recorded });
    }

    const allPublic = events.every((event) =>
      PUBLIC_MOBILE_USAGE_EVENT_TYPES.includes(
        event.eventType as (typeof PUBLIC_MOBILE_USAGE_EVENT_TYPES)[number],
      ),
    );
    if (!allPublic) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const accessCodeAttempt =
      typeof (body as { accessCodeAttempt?: unknown }).accessCodeAttempt === 'string'
        ? (body as { accessCodeAttempt: string }).accessCodeAttempt.replace(/\D/g, '').slice(0, 6)
        : null;

    const recorded = await recordPublicMobileUsageEvents(db, events, {
      accessCodeAttempt,
      client: clientContext,
      request: requestContext,
    });
    return NextResponse.json({ ok: true, recorded, public: true });
  } catch (error) {
    console.error('Record mobile usage failed:', error);
    return NextResponse.json({ error: 'Failed to record usage' }, { status: 500 });
  } finally {
    await client.close();
  }
}
