import { NextResponse } from 'next/server';
import { ObjectId, type AnyBulkWriteOperation, type Document } from 'mongodb';
import { connectNativeMongoClient } from '@/lib/mongo-client';
import { assertHalkaIsActive } from '@/lib/constituency';
import { canAccessHalka } from '@/lib/constituency-access';
import { unauthorizedResponse } from '@/lib/auth';
import { resolveSessionUser } from '@/lib/session-user';
import type { VoterBatchPayload } from '@/lib/voter-batch';

export const dynamic = 'force-dynamic';

const BATCH_EDITABLE_FIELDS = [
  'silsilaNo',
  'blockCode',
  'gharanaNo',
  'fatherName',
  'cnic',
  'profession',
  'age',
  'address',
] as const;

const CNIC_REGEX = /^\d{5}-\d{7}-\d{1}$/;
const MAX_BATCH_SIZE = 500;

function trimStringFields(updates: Record<string, unknown>): Record<string, unknown> {
  const next = { ...updates };
  for (const key of BATCH_EDITABLE_FIELDS) {
    if (typeof next[key] === 'string') {
      next[key] = (next[key] as string).trim();
    }
  }
  return next;
}

function rebuildDisplayName(existing: Record<string, unknown>, updates: Record<string, unknown>): string {
  const parts = [
    updates.gharanaNo ?? existing.gharanaNo,
    updates.fatherName ?? existing.fatherName,
    updates.profession ?? existing.profession,
    updates.age ?? existing.age,
    updates.address ?? existing.address,
  ]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);

  return parts.join(' ');
}

export async function POST(request: Request) {
  const sessionUser = await resolveSessionUser(request);
  if (!sessionUser) {
    return unauthorizedResponse();
  }

  const body = (await request.json()) as VoterBatchPayload;
  const updates = Array.isArray(body.updates) ? body.updates : [];
  const deletes = Array.isArray(body.deletes) ? body.deletes.map(String) : [];

  if (updates.length + deletes.length === 0) {
    return NextResponse.json({ error: 'No changes to save' }, { status: 400 });
  }

  if (updates.length + deletes.length > MAX_BATCH_SIZE) {
    return NextResponse.json(
      { error: `Batch size exceeds limit of ${MAX_BATCH_SIZE}` },
      { status: 400 }
    );
  }

  const invalidIds = [...updates.map((item) => item.id), ...deletes].filter((id) => !ObjectId.isValid(id));
  if (invalidIds.length > 0) {
    return NextResponse.json({ error: 'One or more voter ids are invalid' }, { status: 400 });
  }

  const client = await connectNativeMongoClient();
  const db = client.db('vdp');

  try {
    const allIds = Array.from(new Set([...updates.map((item) => item.id), ...deletes]));
    const objectIds = allIds.map((id) => new ObjectId(id));
    const existingDocs = await db
      .collection('voters')
      .find({ _id: { $in: objectIds } })
      .toArray();

    const existingById = new Map(existingDocs.map((doc) => [String(doc._id), doc]));

    for (const id of allIds) {
      const voter = existingById.get(id);
      if (!voter) {
        return NextResponse.json({ error: `Voter not found: ${id}` }, { status: 404 });
      }

      const halkaName = String(voter.halkaName ?? '');
      if (!canAccessHalka(sessionUser, halkaName)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const halkaCheck = await assertHalkaIsActive(halkaName);
      if (!halkaCheck.ok) {
        return NextResponse.json({ error: halkaCheck.error }, { status: 403 });
      }
    }

    const errors: Array<{ id: string; error: string }> = [];
    const bulkOps: AnyBulkWriteOperation<Document>[] = [];

    for (const item of updates) {
      const existing = existingById.get(item.id);
      if (!existing) continue;

      const rawUpdates: Record<string, unknown> = {};
      for (const field of BATCH_EDITABLE_FIELDS) {
        if (item[field] !== undefined) {
          rawUpdates[field] = item[field];
        }
      }

      if (Object.keys(rawUpdates).length === 0) {
        continue;
      }

      const normalized = trimStringFields(rawUpdates);

      if (normalized.cnic != null && typeof normalized.cnic === 'string' && !CNIC_REGEX.test(normalized.cnic)) {
        errors.push({ id: item.id, error: 'Invalid CNIC format' });
        continue;
      }

      const nextCnic =
        typeof normalized.cnic === 'string' ? normalized.cnic : String(existing.cnic ?? '');

      if (nextCnic !== existing.cnic) {
        const duplicate = await db.collection('voters').findOne({
          cnic: nextCnic,
          halkaName: existing.halkaName,
          _id: { $ne: existing._id },
        });
        if (duplicate) {
          errors.push({ id: item.id, error: 'CNIC already exists in constituency' });
          continue;
        }
      }

      bulkOps.push({
        updateOne: {
          filter: { _id: existing._id },
          update: {
            $set: {
              ...normalized,
              name: rebuildDisplayName(existing, normalized),
              updatedAt: new Date(),
            },
          },
        },
      });
    }

    for (const id of deletes) {
      const existing = existingById.get(id);
      if (!existing) continue;

      bulkOps.push({
        deleteOne: {
          filter: { _id: existing._id },
        },
      });
    }

    if (errors.length > 0 && bulkOps.length === 0) {
      return NextResponse.json(
        {
          error: 'All updates failed validation',
          errors,
        },
        { status: 400 }
      );
    }

    let updated = 0;
    let deleted = 0;

    if (bulkOps.length > 0) {
      const result = await db.collection('voters').bulkWrite(bulkOps, { ordered: false });
      updated = result.modifiedCount ?? 0;
      deleted = result.deletedCount ?? 0;
    }

    return NextResponse.json({
      message: 'Batch changes saved',
      updated,
      deleted,
      ...(errors.length > 0 ? { errors } : {}),
    });
  } catch (error) {
    console.error('Voter batch save failed:', error);
    return NextResponse.json({ error: 'Failed to save batch changes' }, { status: 500 });
  } finally {
    await client.close();
  }
}
