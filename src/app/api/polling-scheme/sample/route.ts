import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const sampleRows = [
  {
    Page: 1,
    District: 'Rawalpindi',
    'Sl No': 1,
    'Polling Station': 'Govt Muslim Higher Secondary School No. 1, Said Pur Road, Rawalpindi. (Male)',
    'Area Type': 'Ward/Mohalla/Street',
    'Area Name': '1وارڈ نمبر',
    'Electoral Roll Code': 1102025,
    'Male Voters': 96,
    'Female Voters': 0,
    'Total Voters': 96,
    'Male Booths': 1,
    'Female Booths': 0,
    'Total Booths': 1,
    'Row Type': 'Detail',
    'Source Raw Text':
      '1 Govt Muslim Higher Secondary School No. 1, Said Pur Road, Rawalpindi. (Male) 1وارڈ نمبر 1102025 96 0 96 1 0 1',
  },
  {
    Page: 1,
    District: 'Rawalpindi',
    'Sl No': 1,
    'Polling Station': 'Govt Muslim Higher Secondary School No. 1, Said Pur Road, Rawalpindi. (Male)',
    'Area Type': 'Ward/Mohalla/Street',
    'Area Name': '2وارڈ نمبر',
    'Electoral Roll Code': 1102026,
    'Male Voters': 142,
    'Female Voters': 0,
    'Total Voters': 142,
    'Male Booths': '',
    'Female Booths': '',
    'Total Booths': '',
    'Row Type': 'Detail',
    'Source Raw Text': '2وارڈ نمبر 1102026 142 0 142',
  },
  {
    Page: 1,
    District: 'Rawalpindi',
    'Sl No': 1,
    'Polling Station': 'Govt Muslim Higher Secondary School No. 1, Said Pur Road, Rawalpindi. (Male)',
    'Area Type': '',
    'Area Name': '',
    'Electoral Roll Code': '',
    'Male Voters': 238,
    'Female Voters': 0,
    'Total Voters': 238,
    'Male Booths': 1,
    'Female Booths': 0,
    'Total Booths': 1,
    'Row Type': 'Station Total',
    'Source Raw Text': 'Total 238 0 238 1 0 1',
  },
];

export async function GET() {
  const worksheet = XLSX.utils.json_to_sheet(sampleRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Polling Scheme');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="polling-scheme-sample.xlsx"',
    },
  });
}
