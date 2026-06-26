import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const sampleRows = [
  {
    name: 'Ali Khan',
    email: 'ali@example.com',
    password: 'pass123',
    role: 'user',
    constituency: 'NA120',
  },
  {
    name: 'Sara Ahmed',
    email: 'sara@example.com',
    password: 'pass456',
    role: 'user',
    constituency: '',
  },
  {
    name: 'Usman Raza',
    email: 'usman@example.com',
    password: 'pass789',
    role: 'user',
    constituency: 'all',
  },
];

export async function GET() {
  const worksheet = XLSX.utils.json_to_sheet(sampleRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Users');

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  return new NextResponse(buffer, {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="user-import-sample.xlsx"',
    },
  });
}
