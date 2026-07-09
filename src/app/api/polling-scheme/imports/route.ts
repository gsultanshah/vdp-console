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
    const imports = await db
      .collection('polling_scheme_imports')
      .find({ halkaName })
      .sort({ importedAt: -1 })
      .limit(50)
      .toArray();

    return NextResponse.json({
      halkaName,
      imports: imports.map((doc) => ({
        id: String(doc._id),
        source: doc.source ?? null,
        sourceFileName: doc.sourceFileName ?? null,
        sourceFileUrl: doc.sourceFileUrl ?? null,
        sourceStoragePath: doc.sourceStoragePath ?? null,
        district: doc.district ?? '',
        importedAt: doc.importedAt ?? null,
        insertedRows: doc.insertedRows ?? 0,
        skippedRows: doc.skippedRows ?? 0,
        errorCount: doc.errorCount ?? 0,
        status: doc.status ?? 'completed',
        errorMessage: doc.errorMessage ?? null,
      })),
    });
  } catch (error) {
    console.error('Polling scheme imports list failed:', error);
    return NextResponse.json({ error: 'Failed to load import history' }, { status: 500 });
  } finally {
    await client.close();
  }
}
