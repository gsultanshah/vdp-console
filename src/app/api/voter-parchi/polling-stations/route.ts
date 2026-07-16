import { NextResponse } from 'next/server';
import { connectNativeMongoClient } from '@/lib/mongo-client';
import { forbiddenResponse, requireAdmin, unauthorizedResponse } from '@/lib/auth';
import { canAccessHalka } from '@/lib/constituency-access';
import { upsertPollingStationOverride } from '@/lib/voter-parchi/polling-station-overrides';

export const dynamic = 'force-dynamic';

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
