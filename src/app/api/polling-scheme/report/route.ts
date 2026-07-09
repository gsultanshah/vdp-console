import { NextResponse } from 'next/server';
import { connectNativeMongoClient } from '@/lib/mongo-client';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const halkaName = searchParams.get('halkaName')?.replace(/\s+/g, '').toUpperCase() ?? '';

  if (!halkaName) {
    return NextResponse.json({ error: 'halkaName is required' }, { status: 400 });
  }

  const client = await connectNativeMongoClient();
  const db = client.db('vdp');

  try {
    const collection = db.collection('polling_scheme');
    const importsCollection = db.collection('polling_scheme_imports');
    const match = { halkaName };

    const [total, byType, bySource, byRowType, distinctBlockcodes, latestImport] = await Promise.all([
      collection.countDocuments(match),
      collection
        .aggregate<{ _id: string; count: number }>([
          { $match: match },
          { $group: { _id: '$type', count: { $sum: 1 } } },
        ])
        .toArray(),
      collection
        .aggregate<{ _id: string; count: number }>([
          { $match: match },
          { $group: { _id: '$source', count: { $sum: 1 } } },
        ])
        .toArray(),
      collection
        .aggregate<{ _id: string; count: number }>([
          { $match: match },
          { $group: { _id: '$rowType', count: { $sum: 1 } } },
        ])
        .toArray(),
      collection.distinct('blockcode', match),
      importsCollection
        .find(match, { projection: { importedAt: 1, sourceFileName: 1, source: 1 } })
        .sort({ importedAt: -1 })
        .limit(1)
        .toArray(),
    ]);

    const latest = latestImport[0] as
      | {
          importedAt?: Date;
          sourceFileName?: string;
          source?: string;
          sourceFileUrl?: string;
          sourceStoragePath?: string;
          insertedRows?: number;
          skippedRows?: number;
        }
      | undefined;

    return NextResponse.json({
      halkaName,
      total,
      distinctBlockcodes: distinctBlockcodes.length,
      byType: Object.fromEntries(byType.map((row) => [row._id || 'unknown', row.count])),
      bySource: Object.fromEntries(bySource.map((row) => [row._id || 'unknown', row.count])),
      byRowType: Object.fromEntries(byRowType.map((row) => [row._id || 'unknown', row.count])),
      latestImport: latest
        ? {
            importedAt: latest.importedAt ?? null,
            source: latest.source ?? null,
            sourceFileName: latest.sourceFileName ?? null,
            sourceFileUrl: latest.sourceFileUrl ?? null,
            sourceStoragePath: latest.sourceStoragePath ?? null,
            insertedRows: latest.insertedRows ?? 0,
            skippedRows: latest.skippedRows ?? 0,
          }
        : null,
    });
  } catch (error) {
    console.error('Polling scheme report failed:', error);
    return NextResponse.json({ error: 'Failed to load polling scheme report' }, { status: 500 });
  } finally {
    await client.close();
  }
}

