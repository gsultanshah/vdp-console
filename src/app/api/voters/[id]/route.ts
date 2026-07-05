import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectNativeMongoClient } from '@/lib/mongo-client';
import { assertHalkaIsActive } from '@/lib/constituency';
import { canAccessHalka } from '@/lib/constituency-access';
import { unauthorizedResponse } from '@/lib/auth';
import { resolveSessionUser } from '@/lib/session-user';

export const dynamic = 'force-dynamic';

const EDITABLE_FIELDS = [
  'silsilaNo',
  'blockCode',
  'gharanaNo',
  'name',
  'cnic',
  'fatherName',
  'profession',
  'age',
  'address',
  'previousAddress',
  'religion',
  'gender',
  'row',
  'rowY',
  'rowHeight',
] as const;

function serializeVoter(doc: Record<string, unknown>) {
  return {
    ...doc,
    _id: String(doc._id),
  };
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const sessionUser = await resolveSessionUser(request);
  if (!sessionUser) {
    return unauthorizedResponse();
  }

  if (!ObjectId.isValid(params.id)) {
    return NextResponse.json({ error: 'Invalid voter id' }, { status: 400 });
  }

  const client = await connectNativeMongoClient();
  const db = client.db('vdp');

  try {
    const voter = await db.collection('voters').findOne({ _id: new ObjectId(params.id) });
    if (!voter) {
      return NextResponse.json({ error: 'Voter not found' }, { status: 404 });
    }

    const halkaName = String(voter.halkaName ?? '');
    if (!canAccessHalka(sessionUser, halkaName)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ voter: serializeVoter(voter as Record<string, unknown>) });
  } finally {
    await client.close();
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const sessionUser = await resolveSessionUser(request);
  if (!sessionUser) {
    return unauthorizedResponse();
  }

  if (!ObjectId.isValid(params.id)) {
    return NextResponse.json({ error: 'Invalid voter id' }, { status: 400 });
  }

  const body = (await request.json()) as Record<string, unknown>;
  const updates: Record<string, unknown> = {};

  for (const field of EDITABLE_FIELDS) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  if (updates.cnic != null && typeof updates.cnic === 'string') {
    const cnic = updates.cnic.trim();
    const cnicRegex = /^\d{5}-\d{7}-\d{1}$/;
    if (!cnicRegex.test(cnic)) {
      return NextResponse.json(
        { error: 'Invalid CNIC format. Must be XXXXX-XXXXXXX-X' },
        { status: 400 }
      );
    }
    updates.cnic = cnic;
  }

  for (const key of ['silsilaNo', 'blockCode', 'gharanaNo', 'name', 'fatherName', 'profession', 'address', 'previousAddress', 'religion', 'gender'] as const) {
    if (typeof updates[key] === 'string') {
      updates[key] = (updates[key] as string).trim();
    }
  }

  const client = await connectNativeMongoClient();
  const db = client.db('vdp');

  try {
    const existing = await db.collection('voters').findOne({ _id: new ObjectId(params.id) });
    if (!existing) {
      return NextResponse.json({ error: 'Voter not found' }, { status: 404 });
    }

    const currentHalka = String(existing.halkaName ?? '');
    if (!canAccessHalka(sessionUser, currentHalka)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const halkaCheck = await assertHalkaIsActive(currentHalka);
    if (!halkaCheck.ok) {
      return NextResponse.json({ error: halkaCheck.error }, { status: 403 });
    }

    const nextCnic = typeof updates.cnic === 'string' ? updates.cnic : String(existing.cnic ?? '');
    if (nextCnic !== existing.cnic) {
      const duplicate = await db.collection('voters').findOne({
        cnic: nextCnic,
        halkaName: currentHalka,
        _id: { $ne: existing._id },
      });
      if (duplicate) {
        return NextResponse.json(
          { error: 'Another voter with this CNIC already exists in this constituency' },
          { status: 409 }
        );
      }
    }

    await db.collection('voters').updateOne(
      { _id: existing._id },
      {
        $set: {
          ...updates,
          updatedAt: new Date(),
        },
      }
    );

    const updated = await db.collection('voters').findOne({ _id: existing._id });
    return NextResponse.json({
      message: 'Voter updated successfully',
      voter: serializeVoter(updated as Record<string, unknown>),
    });
  } catch (error) {
    console.error('Failed to update voter:', error);
    return NextResponse.json({ error: 'Failed to update voter' }, { status: 500 });
  } finally {
    await client.close();
  }
}
