import { NextResponse } from 'next/server';
import { connectNativeMongoClient } from '@/lib/mongo-client';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';

type ExportRow = {
  Page: number | string;
  District: string;
  'Sl No': string;
  'Polling Station': string;
  'Area Type': string;
  'Area Name': string;
  'Electoral Roll Code': string;
  'Male Voters': number | string;
  'Female Voters': number | string;
  'Total Voters': number | string;
  'Male Booths': string;
  'Female Booths': string;
  'Total Booths': string;
  'Row Type': string;
  'Source Raw Text': string;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const halkaName = searchParams.get('halkaName')?.replace(/\s+/g, '').toUpperCase() ?? '';
  if (!halkaName) {
    return NextResponse.json({ error: 'halkaName is required' }, { status: 400 });
  }

  const client = await connectNativeMongoClient();
  const db = client.db('vdp');

  try {
    const docs = await db
      .collection('polling_scheme')
      .find({ halkaName })
      .sort({ page: 1, sn: 1, blockcode: 1, type: 1 })
      .limit(200_000)
      .toArray();

    const rows: ExportRow[] = docs.map((doc) => ({
      Page: doc.page ?? '',
      District: doc.district ?? '',
      'Sl No': doc.sn ?? '',
      'Polling Station': doc.polling_station_name ?? '',
      'Area Type': doc.areaType ?? '',
      'Area Name': doc.area ?? '',
      'Electoral Roll Code': doc.blockcode == null ? '' : String(doc.blockcode),
      'Male Voters': typeof doc.male === 'number' ? doc.male : Number(doc.male) || 0,
      'Female Voters': typeof doc.female === 'number' ? doc.female : Number(doc.female) || 0,
      'Total Voters': typeof doc.total === 'number' ? doc.total : Number(doc.total) || 0,
      'Male Booths': doc.male_booth ?? '',
      'Female Booths': doc.female_booth ?? '',
      'Total Booths': doc.total_booth ?? '',
      'Row Type': doc.rowType ?? '',
      'Source Raw Text': doc.sourceRawText ?? '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Polling Scheme');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    return new NextResponse(buffer, {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${halkaName}-polling-scheme.xlsx"`,
      },
    });
  } catch (error) {
    console.error('Polling scheme export failed:', error);
    return NextResponse.json({ error: 'Failed to export polling scheme' }, { status: 500 });
  } finally {
    await client.close();
  }
}

