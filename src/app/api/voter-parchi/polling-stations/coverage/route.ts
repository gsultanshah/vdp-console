import { NextResponse } from 'next/server';
import { connectNativeMongoClient } from '@/lib/mongo-client';
import { forbiddenResponse, getUserFromRequest, unauthorizedResponse } from '@/lib/auth';
import { canAccessHalka } from '@/lib/constituency-access';
import {
  listCoveredPollingStationBlockKeys,
  normalizePollingOverrideBlockKey,
} from '@/lib/voter-parchi/polling-station-overrides';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const user = getUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  try {
    const body = (await request.json()) as {
      halkaName?: string;
      blockCodes?: string[];
    };

    const halkaName = String(body.halkaName ?? '').trim();
    const blockCodes = Array.isArray(body.blockCodes)
      ? body.blockCodes.map((value) => String(value ?? '').trim()).filter(Boolean)
      : [];

    if (!halkaName) {
      return NextResponse.json({ error: 'halkaName is required' }, { status: 400 });
    }
    if (!canAccessHalka(user, halkaName)) {
      return forbiddenResponse();
    }

    const client = await connectNativeMongoClient();
    const db = client.db('vdp');
    const covered = await listCoveredPollingStationBlockKeys(db, halkaName, blockCodes);

    return NextResponse.json({
      coveredBlockCodes: Array.from(covered),
      blockCodeStatus: blockCodes.map((blockCode) => ({
        blockCode,
        normalizedBlockCode: normalizePollingOverrideBlockKey(blockCode),
        hasPollingStation: covered.has(normalizePollingOverrideBlockKey(blockCode)),
      })),
    });
  } catch (error) {
    console.error('Load polling station coverage failed:', error);
    return NextResponse.json({ error: 'Failed to load polling station coverage' }, { status: 500 });
  }
}
