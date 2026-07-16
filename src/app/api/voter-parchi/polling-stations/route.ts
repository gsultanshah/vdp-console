import { NextResponse } from 'next/server';
import { connectNativeMongoClient } from '@/lib/mongo-client';
import { forbiddenResponse, getUserFromRequest, requireAdmin, unauthorizedResponse } from '@/lib/auth';
import { canAccessHalka } from '@/lib/constituency-access';
import { findPollingSchemeDoc } from '@/lib/polling-scheme/blockcode-lookup';
import {
  getPollingStationOverride,
  upsertPollingStationOverride,
} from '@/lib/voter-parchi/polling-station-overrides';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const user = getUserFromRequest(request);
  if (!user) {
    return unauthorizedResponse();
  }

  try {
    const { searchParams } = new URL(request.url);
    const halkaName = String(searchParams.get('halkaName') ?? '').trim();
    const blockCode = String(searchParams.get('blockCode') ?? '').trim();

    if (!halkaName || !blockCode) {
      return NextResponse.json({ error: 'halkaName and blockCode are required' }, { status: 400 });
    }
    if (!canAccessHalka(user, halkaName)) {
      return forbiddenResponse();
    }

    const client = await connectNativeMongoClient();
    const db = client.db('vdp');

    const override = await getPollingStationOverride(db, halkaName, blockCode);
    if (override) {
      return NextResponse.json({
        blockCode,
        pollingStation: override,
        source: 'override',
      });
    }

    const typesToTry: Array<'combined' | 'male' | 'female'> = ['combined', 'male', 'female'];
    for (const type of typesToTry) {
      const doc = await findPollingSchemeDoc(db, {
        halkaName,
        blockCode,
        type,
      });
      const pollingStation = String(doc?.polling_station_name ?? '').trim();
      if (pollingStation) {
        return NextResponse.json({
          blockCode,
          pollingStation,
          source: 'polling-scheme',
          type,
        });
      }
    }

    return NextResponse.json({
      blockCode,
      pollingStation: '',
      source: null,
    });
  } catch (error) {
    console.error('Load polling station failed:', error);
    return NextResponse.json({ error: 'Failed to load polling station' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const admin = requireAdmin(request);
  if (!admin) {
    const hasSession = request.headers.get('cookie')?.includes('user=');
    return hasSession ? forbiddenResponse() : unauthorizedResponse();
  }

  try {
    const body = (await request.json()) as {
      halkaName?: string;
      blockCode?: string;
      pollingStation?: string;
    };

    const halkaName = String(body.halkaName ?? '').trim();
    const blockCode = String(body.blockCode ?? '').trim();
    const pollingStation = String(body.pollingStation ?? '').trim();

    if (!halkaName || !blockCode || !pollingStation) {
      return NextResponse.json(
        { error: 'halkaName, blockCode, and pollingStation are required' },
        { status: 400 }
      );
    }
    if (!canAccessHalka(admin, halkaName)) {
      return forbiddenResponse();
    }

    const client = await connectNativeMongoClient();
    const db = client.db('vdp');
    const override = await upsertPollingStationOverride(db, {
      halkaName,
      blockCode,
      pollingStation,
      updatedBy: admin.email,
      updatedByName: admin.name,
    });

    return NextResponse.json({ override });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save polling station';
    const status = message.includes('required') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
