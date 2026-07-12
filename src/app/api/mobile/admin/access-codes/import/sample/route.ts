import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { buildAccessCodeSampleRows } from '@/lib/mobile/access-code-import';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const halkaName = searchParams.get('halkaName')?.trim() || 'NA120';
  const sampleRows = buildAccessCodeSampleRows(halkaName);

  const worksheet = XLSX.utils.json_to_sheet(sampleRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'MobileLogins');

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  return new NextResponse(buffer, {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="mobile-access-codes-sample.xlsx"',
    },
  });
}
