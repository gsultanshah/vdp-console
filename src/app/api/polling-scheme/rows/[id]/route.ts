import { NextResponse } from 'next/server';
import { connectNativeMongoClient } from '@/lib/mongo-client';
import { ObjectId } from 'mongodb';
import { docToApiRow, inputToDbDoc } from '@/lib/polling-scheme/row-mapper';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: { id: string };
}

export async function GET(_request: Request, { params }: RouteContext) {
  if (!ObjectId.isValid(params.id)) {
    return NextResponse.json({ error: 'Invalid row id' }, { status: 400 });
  }

  const client = await connectNativeMongoClient();
  const db = client.db('vdp');

  try {
    const doc = await db.collection('polling_scheme').findOne({ _id: new ObjectId(params.id) });
    if (!doc) {
      return NextResponse.json({ error: 'Row not found' }, { status: 404 });
    }
    return NextResponse.json({ row: docToApiRow(doc as Record<string, unknown>) });
  } finally {
    await client.close();
  }
}

export async function PUT(request: Request, { params }: RouteContext) {
  if (!ObjectId.isValid(params.id)) {
    return NextResponse.json({ error: 'Invalid row id' }, { status: 400 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const client = await connectNativeMongoClient();
    const db = client.db('vdp');
    const collection = db.collection('polling_scheme');
    const objectId = new ObjectId(params.id);

    try {
      const existing = await collection.findOne({ _id: objectId });
      if (!existing) {
        return NextResponse.json({ error: 'Row not found' }, { status: 404 });
      }

      const halkaName = String(existing.halkaName ?? body.halkaName ?? '').replace(/\s+/g, '').toUpperCase();
      const updateDoc = inputToDbDoc(body, halkaName, existing as Record<string, unknown>);

      await collection.updateOne({ _id: objectId }, { $set: updateDoc });
      const updated = await collection.findOne({ _id: objectId });

      return NextResponse.json({
        row: updated ? docToApiRow(updated as Record<string, unknown>) : null,
      });
    } finally {
      await client.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update row';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  if (!ObjectId.isValid(params.id)) {
    return NextResponse.json({ error: 'Invalid row id' }, { status: 400 });
  }

  const client = await connectNativeMongoClient();
  const db = client.db('vdp');

  try {
    const result = await db.collection('polling_scheme').deleteOne({ _id: new ObjectId(params.id) });
    if (result.deletedCount === 0) {
      return NextResponse.json({ error: 'Row not found' }, { status: 404 });
    }
    return NextResponse.json({ message: 'Row deleted', deletedCount: result.deletedCount });
  } finally {
    await client.close();
  }
}
