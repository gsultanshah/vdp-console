import { NextResponse } from 'next/server';
import { connectNativeMongoClient } from '@/lib/mongo-client';
import {
  buildSearchFilter,
  docToApiRow,
  inputToDbDoc,
  type PollingSchemeRowInput,
} from '@/lib/polling-scheme/row-mapper';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const halkaName = searchParams.get('halkaName')?.replace(/\s+/g, '').toUpperCase() ?? '';
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get('limit') ?? '25', 10) || 25));
  const search = searchParams.get('search')?.trim() ?? '';
  const rowType = searchParams.get('rowType')?.trim() ?? '';
  const stationType = searchParams.get('type')?.trim() ?? '';

  if (!halkaName) {
    return NextResponse.json({ error: 'halkaName is required' }, { status: 400 });
  }

  const client = await connectNativeMongoClient();
  const db = client.db('vdp');

  try {
    const filter = buildSearchFilter(halkaName, search);
    if (rowType) filter.rowType = rowType;
    if (stationType) filter.type = stationType;

    const collection = db.collection('polling_scheme');
    const [total, docs] = await Promise.all([
      collection.countDocuments(filter),
      collection
        .find(filter)
        .sort({ page: 1, sn: 1, blockcode: 1, type: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
    ]);

    return NextResponse.json({
      halkaName,
      page,
      limit,
      total,
      rows: docs.map((doc) => docToApiRow(doc as Record<string, unknown>)),
    });
  } catch (error) {
    console.error('Polling scheme rows list failed:', error);
    return NextResponse.json({ error: 'Failed to load polling scheme rows' }, { status: 500 });
  } finally {
    await client.close();
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PollingSchemeRowInput & { halkaName?: string };
    const { halkaName: rawHalkaName, ...rowInput } = body;
    const halkaName = rawHalkaName?.replace(/\s+/g, '').toUpperCase() ?? '';
    if (!halkaName) {
      return NextResponse.json({ error: 'halkaName is required' }, { status: 400 });
    }

    const client = await connectNativeMongoClient();
    const db = client.db('vdp');

    try {
      const doc = inputToDbDoc(rowInput, halkaName);
      doc.source = 'manual';
      doc.importedAt = new Date();

      const result = await db.collection('polling_scheme').insertOne(doc);
      const inserted = await db.collection('polling_scheme').findOne({ _id: result.insertedId });

      return NextResponse.json({
        row: inserted ? docToApiRow(inserted as Record<string, unknown>) : null,
      });
    } finally {
      await client.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create row';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
