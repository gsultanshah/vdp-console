import { NextResponse } from 'next/server';
import { connectNativeMongoClient, getVdpDb } from '@/lib/mongo-client';
import { requireUserManager } from '@/lib/auth';
import {
  getMobileUsageSummary,
  listMobileUsageEvents,
  MOBILE_USAGE_EVENT_TYPES,
} from '@/lib/mobile/usage';

export const dynamic = 'force-dynamic';

function parseSince(value: string | null) {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export async function GET(request: Request) {
  const manager = requireUserManager(request);
  if (!manager) {
    return NextResponse.json({ error: 'User management access required' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const halkaName = searchParams.get('halkaName') ?? undefined;
  const accessCode = searchParams.get('accessCode') ?? undefined;
  const eventType = searchParams.get('eventType') ?? undefined;
  const limit = Number.parseInt(searchParams.get('limit') ?? '200', 10);
  const since = parseSince(searchParams.get('since'));
  const until = parseSince(searchParams.get('until'));
  const includeSummary = searchParams.get('summary') === 'true';

  if (eventType && !MOBILE_USAGE_EVENT_TYPES.includes(eventType as (typeof MOBILE_USAGE_EVENT_TYPES)[number])) {
    return NextResponse.json({ error: 'Invalid event type' }, { status: 400 });
  }

  const client = await connectNativeMongoClient();
  try {
    const db = getVdpDb(client);
    const events = await listMobileUsageEvents(db, {
      halkaName,
      accessCode,
      eventType,
      limit: Number.isFinite(limit) ? limit : 200,
      since,
      until,
    });

    const response: Record<string, unknown> = {
      events,
      eventTypes: MOBILE_USAGE_EVENT_TYPES,
    };

    if (includeSummary) {
      response.summary = await getMobileUsageSummary(db, {
        halkaName,
        accessCode,
        since,
        until,
      });
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('List mobile usage failed:', error);
    return NextResponse.json({ error: 'Failed to load usage events' }, { status: 500 });
  } finally {
    await client.close();
  }
}
