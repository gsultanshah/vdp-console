import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Constituency from '@/models/Constituency';
import BlockCodeWorkProgress from '@/models/BlockCodeWorkProgress';
import { canAccessHalka } from '@/lib/constituency-access';
import { resolveSessionUser } from '@/lib/session-user';
import {
  buildWorkProgressSummary,
  isBlockWorkStatus,
  type BlockWorkProgressHistoryEntry,
  type BlockWorkProgressRecord,
  type BlockWorkProgressUser,
} from '@/lib/block-work-progress';

export const dynamic = 'force-dynamic';

type RawHistoryEntry = {
  status: string;
  comments?: string;
  changedAt?: Date;
  changedBy: BlockWorkProgressUser;
};

function toUserInfo(sessionUser: { _id?: string; email: string; name?: string }): BlockWorkProgressUser {
  return {
    userId: sessionUser._id ? String(sessionUser._id) : undefined,
    email: sessionUser.email,
    name: sessionUser.name,
  };
}

function serializeRecord(doc: {
  blockCode: string;
  halkaName: string;
  status: string;
  comments?: string;
  updatedAt?: Date;
  updatedBy?: BlockWorkProgressUser;
  history?: RawHistoryEntry[];
}): BlockWorkProgressRecord {
  return {
    blockCode: doc.blockCode,
    halkaName: doc.halkaName,
    status: isBlockWorkStatus(doc.status) ? doc.status : 'pending',
    comments: doc.comments ?? '',
    updatedAt: doc.updatedAt?.toISOString() ?? new Date().toISOString(),
    updatedBy: doc.updatedBy,
    history: (doc.history ?? [])
      .slice()
      .reverse()
      .map(
        (entry): BlockWorkProgressHistoryEntry => ({
          status: isBlockWorkStatus(entry.status) ? entry.status : 'pending',
          comments: entry.comments ?? '',
          changedAt: entry.changedAt?.toISOString() ?? new Date().toISOString(),
          changedBy: entry.changedBy,
        })
      ),
  };
}

export async function GET(request: Request) {
  try {
    const sessionUser = await resolveSessionUser(request);
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const halkaName = searchParams.get('halkaName')?.trim();

    if (!halkaName) {
      return NextResponse.json({ error: 'halkaName is required' }, { status: 400 });
    }

    if (!canAccessHalka(sessionUser, halkaName)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await connectDB();

    const constituency = await Constituency.findOne({ halkaName, deletedAt: null }).lean<{ blockCodes?: string[] }>();
    if (!constituency) {
      return NextResponse.json({ error: 'Constituency not found' }, { status: 404 });
    }

    const blockCodes = (constituency.blockCodes ?? []).map(String);
    const docs = await BlockCodeWorkProgress.find({ halkaName }).lean();

    const records: Record<string, BlockWorkProgressRecord> = {};
    for (const doc of docs) {
      records[doc.blockCode] = serializeRecord({
        blockCode: doc.blockCode,
        halkaName: doc.halkaName,
        status: doc.status,
        comments: doc.comments,
        updatedAt: doc.updatedAt,
        updatedBy: doc.updatedBy as BlockWorkProgressUser | undefined,
        history: (doc.history ?? []) as RawHistoryEntry[],
      });
    }

    return NextResponse.json({
      halkaName,
      blockCodes,
      records,
      summary: buildWorkProgressSummary(blockCodes, records),
    });
  } catch (error) {
    console.error('Failed to load block work progress:', error);
    return NextResponse.json({ error: 'Failed to load block work progress' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const sessionUser = await resolveSessionUser(request);
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as {
      halkaName?: string;
      blockCode?: string;
      status?: string;
      comments?: string;
    };

    const halkaName = body.halkaName?.trim();
    const blockCode = body.blockCode?.trim();
    const status = body.status?.trim();
    const comments = body.comments != null ? String(body.comments) : '';

    if (!halkaName || !blockCode) {
      return NextResponse.json({ error: 'halkaName and blockCode are required' }, { status: 400 });
    }

    if (!status || !isBlockWorkStatus(status)) {
      return NextResponse.json({ error: 'Valid status is required' }, { status: 400 });
    }

    if (!canAccessHalka(sessionUser, halkaName)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await connectDB();

    const constituency = await Constituency.findOne({ halkaName, deletedAt: null }).lean<{ blockCodes?: string[] }>();
    if (!constituency) {
      return NextResponse.json({ error: 'Constituency not found' }, { status: 404 });
    }

    const blockCodes = (constituency.blockCodes ?? []).map(String);
    if (!blockCodes.includes(blockCode)) {
      return NextResponse.json({ error: 'Block code not found in constituency' }, { status: 404 });
    }

    const changedBy = toUserInfo(sessionUser);
    const existing = await BlockCodeWorkProgress.findOne({ halkaName, blockCode });

    const historyEntry = {
      status,
      comments,
      changedAt: new Date(),
      changedBy,
    };

    let doc;
    if (existing) {
      existing.status = status;
      existing.comments = comments;
      existing.updatedBy = changedBy;
      existing.history = [...(existing.history ?? []), historyEntry];
      doc = await existing.save();
    } else {
      doc = await BlockCodeWorkProgress.create({
        halkaName,
        blockCode,
        status,
        comments,
        updatedBy: changedBy,
        history: [historyEntry],
      });
    }

    return NextResponse.json(
      serializeRecord({
        blockCode: doc.blockCode,
        halkaName: doc.halkaName,
        status: doc.status,
        comments: doc.comments,
        updatedAt: doc.updatedAt,
        updatedBy: doc.updatedBy as BlockWorkProgressUser | undefined,
        history: (doc.history ?? []) as RawHistoryEntry[],
      })
    );
  } catch (error) {
    console.error('Failed to save block work progress:', error);
    return NextResponse.json({ error: 'Failed to save block work progress' }, { status: 500 });
  }
}
