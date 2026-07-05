import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { connectNativeMongoClient } from '@/lib/mongo-client';
import Constituency from '@/models/Constituency';
import { unauthorizedResponse } from '@/lib/auth';
import { canAccessHalka } from '@/lib/constituency-access';
import { resolveSessionUser } from '@/lib/session-user';
import { getHalkaVoterStats } from '@/lib/voter-block-stats';

export const dynamic = 'force-dynamic';

function emptyPageStats() {
  return {
    total: 0,
    completed: 0,
    processing: 0,
    error: 0,
    uploaded: 0,
    byStatus: {} as Record<string, number>,
    byTag: {} as Record<string, number>,
  };
}

export async function GET(request: Request) {
  const sessionUser = await resolveSessionUser(request);
  if (!sessionUser) {
    return unauthorizedResponse();
  }

  const { searchParams } = new URL(request.url);
  const halkaName = searchParams.get('halkaName')?.trim();

  if (!halkaName) {
    return NextResponse.json({ error: 'halkaName is required' }, { status: 400 });
  }

  if (!canAccessHalka(sessionUser, halkaName)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await connectDB();
    const doc = await Constituency.findOne({ halkaName, deletedAt: null }).lean();

    if (!doc || Array.isArray(doc)) {
      return NextResponse.json({ error: 'Constituency not found' }, { status: 404 });
    }

    const constituency = doc as unknown as {
      _id: unknown;
      halkaName: string;
      status?: string;
      totalVoters?: number;
      muslimFemale?: number;
      muslimMale?: number;
      qadianiFemale?: number;
      qadianiMale?: number;
      blockCodes?: string[];
      lastUpdated?: Date;
    };

    const client = await connectNativeMongoClient();
    const db = client.db('vdp');

    let pages = emptyPageStats();
    let voters = { count: 0, male: 0, female: 0 };

    try {
      const [statusRows, tagRows, voterStats] = await Promise.all([
        db
          .collection('blockcodes')
          .aggregate([
            { $match: { halkaName } },
            { $group: { _id: '$status', count: { $sum: 1 } } },
          ])
          .toArray(),
        db
          .collection('blockcodes')
          .aggregate([
            { $match: { halkaName } },
            { $group: { _id: '$tag', count: { $sum: 1 } } },
          ])
          .toArray(),
        getHalkaVoterStats(db, halkaName),
      ]);

      const byStatus: Record<string, number> = {};
      for (const row of statusRows) {
        byStatus[String(row._id ?? 'unknown')] = row.count ?? 0;
      }

      const byTag: Record<string, number> = {};
      for (const row of tagRows) {
        byTag[String(row._id ?? 'unknown')] = row.count ?? 0;
      }

      const total = Object.values(byStatus).reduce((sum, value) => sum + value, 0);
      pages = {
        total,
        completed: byStatus.completed ?? 0,
        processing: byStatus.processing ?? 0,
        error: byStatus.error ?? 0,
        uploaded:
          (byStatus.uploaded ?? 0) +
          (byStatus.completed ?? 0) +
          (byStatus.processing ?? 0) +
          (byStatus.error ?? 0),
        byStatus,
        byTag,
      };

      voters = voterStats;
    } finally {
      await client.close();
    }

    return NextResponse.json({
      _id: String(constituency._id),
      halkaName: constituency.halkaName,
      status: constituency.status ?? 'active',
      totalVoters: constituency.totalVoters ?? 0,
      muslimFemale: constituency.muslimFemale ?? 0,
      muslimMale: constituency.muslimMale ?? 0,
      qadianiFemale: constituency.qadianiFemale ?? 0,
      qadianiMale: constituency.qadianiMale ?? 0,
      blockCodeCount: constituency.blockCodes?.length ?? 0,
      blockCodes: constituency.blockCodes ?? [],
      lastUpdated: constituency.lastUpdated
        ? new Date(constituency.lastUpdated).toISOString()
        : null,
      voters,
      pages,
    });
  } catch (error) {
    console.error('[constituency/overview] failed:', error);
    return NextResponse.json({ error: 'Failed to load constituency overview' }, { status: 500 });
  }
}
