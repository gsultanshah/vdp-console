import { NextResponse } from 'next/server';
import { connectNativeMongoClient } from '@/lib/mongo-client';
import { buildSearchFilter, docToApiRow } from '@/lib/polling-scheme/row-mapper';
import { buildPollingSchemePdf, buildPrintableHtml } from '@/lib/polling-scheme/print-pdf';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const halkaName = searchParams.get('halkaName')?.replace(/\s+/g, '').toUpperCase() ?? '';
  const format = (searchParams.get('format') ?? 'pdf').toLowerCase();
  const search = searchParams.get('search')?.trim() ?? '';

  if (!halkaName) {
    return NextResponse.json({ error: 'halkaName is required' }, { status: 400 });
  }

  const client = await connectNativeMongoClient();
  const db = client.db('vdp');

  try {
    const filter = buildSearchFilter(halkaName, search);
    const docs = await db
      .collection('polling_scheme')
      .find(filter)
      .sort({ page: 1, sn: 1, blockcode: 1, type: 1 })
      .limit(50_000)
      .toArray();

    const rows = docs.map((doc) => docToApiRow(doc as Record<string, unknown>));

    if (format === 'html') {
      const html = buildPrintableHtml(halkaName, rows);
      return new NextResponse(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
        },
      });
    }

    const pdfBuffer = await buildPollingSchemePdf(halkaName, rows);
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${halkaName}-polling-scheme.pdf"`,
      },
    });
  } catch (error) {
    console.error('Polling scheme print failed:', error);
    return NextResponse.json({ error: 'Failed to generate printable PDF' }, { status: 500 });
  } finally {
    await client.close();
  }
}
