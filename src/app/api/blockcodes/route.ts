import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import BlockCode from '@/models/BlockCode';
import { assertBlockCodeIsActive, assertHalkaIsActive } from '@/lib/constituency';
import { canAccessHalka } from '@/lib/constituency-access';
import { resolveSessionUser } from '@/lib/session-user';

// Mark this route as dynamic
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await connectDB();
    const sessionUser = await resolveSessionUser(request);
    const { searchParams } = new URL(request.url);
    const blockCode = searchParams.get('blockCode');
    const halkaName = searchParams.get('halkaName');

    if (!blockCode && !halkaName) {
      return NextResponse.json(
        { error: 'blockCode or halkaName is required' },
        { status: 400 }
      );
    }

    if (halkaName && !canAccessHalka(sessionUser, halkaName)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const query = blockCode ? { blockCode } : { halkaName };
    const pageParam = searchParams.get('page');
    const allowInactive = searchParams.get('allowInactive') === 'true';
    const lite = searchParams.get('lite') === 'true';
    const projection = lite
      ? '_id blockCode fileName url tag halkaName gender religion status uploadedAt'
      : undefined;

    if (!allowInactive) {
      if (halkaName) {
        const halkaCheck = await assertHalkaIsActive(halkaName);
        if (!halkaCheck.ok) {
          return NextResponse.json({ error: halkaCheck.error }, { status: 403 });
        }
      } else if (blockCode) {
        const blockCheck = await assertBlockCodeIsActive(blockCode);
        if (!blockCheck.ok) {
          return NextResponse.json({ error: blockCheck.error }, { status: 403 });
        }
      }
    }

    if (pageParam) {
      const page = Math.max(1, parseInt(pageParam, 10) || 1);
      const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50), 100);
      const skip = (page - 1) * limit;

      const [total, blockCodes] = await Promise.all([
        BlockCode.countDocuments(query),
        lite
          ? BlockCode.find(query).select(projection!).sort({ uploadedAt: 1 }).skip(skip).limit(limit)
          : BlockCode.find(query).sort({ uploadedAt: 1 }).skip(skip).limit(limit),
      ]);

      return NextResponse.json({
        uploads: blockCodes,
        currentPage: page,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        total,
        pageSize: limit,
      });
    }

    const blockCodes = lite
      ? await BlockCode.find(query).select(projection!).sort({ uploadedAt: 1 })
      : await BlockCode.find(query).sort({ uploadedAt: 1 });

    return NextResponse.json(blockCodes);
  } catch (error) {
    console.error('Error fetching block codes:', error);
    return NextResponse.json(
      { error: 'Failed to fetch block codes' },
      { status: 500 }
    );
  }
} 