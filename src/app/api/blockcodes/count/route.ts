import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import BlockCode from '@/models/BlockCode';
import { assertBlockCodeIsActive } from '@/lib/constituency';
import { canAccessHalka } from '@/lib/constituency-access';
import { resolveSessionUser } from '@/lib/session-user';

export const dynamic = 'force-dynamic';

function recordsToMap(rows: Array<{ _id: string; count: number }>): Record<string, number> {
  const map: Record<string, number> = {};
  for (const row of rows) {
    map[row._id || 'unknown'] = row.count;
  }
  return map;
}

export async function GET(request: Request) {
  try {
    await connectDB();

    const sessionUser = await resolveSessionUser(request);
    const { searchParams } = new URL(request.url);
    const blockCode = searchParams.get('blockCode')?.trim();
    const halkaName = searchParams.get('halkaName')?.trim();

    if (!blockCode) {
      return NextResponse.json({ error: 'blockCode is required' }, { status: 400 });
    }

    if (!halkaName) {
      return NextResponse.json({ error: 'halkaName is required' }, { status: 400 });
    }

    if (!canAccessHalka(sessionUser, halkaName)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const activeCheck = await assertBlockCodeIsActive(blockCode);
    if (!activeCheck.ok) {
      return NextResponse.json(
        { total: 0, byStatus: {}, byTag: {}, blockCode, halkaName },
        { status: 200 }
      );
    }

    const match = { blockCode, halkaName };

    const [facetResult] = await BlockCode.aggregate<{
      total: Array<{ count: number }>;
      byStatus: Array<{ _id: string; count: number }>;
      byTag: Array<{ _id: string; count: number }>;
    }>([
      { $match: match },
      {
        $facet: {
          total: [{ $count: 'count' }],
          byStatus: [
            {
              $group: {
                _id: { $ifNull: ['$status', 'unknown'] },
                count: { $sum: 1 },
              },
            },
          ],
          byTag: [
            {
              $group: {
                _id: { $ifNull: ['$tag', 'unknown'] },
                count: { $sum: 1 },
              },
            },
          ],
        },
      },
    ]);

    const total = facetResult?.total[0]?.count ?? 0;

    return NextResponse.json({
      total,
      byStatus: recordsToMap(facetResult?.byStatus ?? []),
      byTag: recordsToMap(facetResult?.byTag ?? []),
      blockCode,
      halkaName,
    });
  } catch (error) {
    console.error('Error counting blockcode pages:', error);
    return NextResponse.json({ error: 'Failed to count uploaded pages' }, { status: 500 });
  }
}
