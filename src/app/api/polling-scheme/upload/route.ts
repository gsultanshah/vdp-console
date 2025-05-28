import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { Readable } from 'stream';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { promises as fs } from 'fs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function parseFile(fileBuffer: Buffer, ext: string) {
  if (ext === 'csv') {
    const csv = fileBuffer.toString('utf8');
    const { data, errors } = Papa.parse(csv, { header: true, skipEmptyLines: true });
    if (errors.length > 0) throw new Error('CSV parse error: ' + errors[0].message);
    return data;
  } else {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(sheet, { defval: '' });
  }
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    const halkaNameRaw = formData.get('halkaName');
    if (!file || typeof halkaNameRaw !== 'string') {
      return NextResponse.json({ error: 'File and Halka Name are required.' }, { status: 400 });
    }
    const halkaName = halkaNameRaw.replace(/\s+/g, '').toUpperCase();
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'File upload error. Please try again.' }, { status: 400 });
    }
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !['xls', 'xlsx', 'csv'].includes(ext)) {
      return NextResponse.json({ error: 'Invalid file format. Please upload an xls, xlsx, or csv file.' }, { status: 400 });
    }
    const rows = await parseFile(fileBuffer, ext);
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'No data found in file.' }, { status: 400 });
    }
    const requiredCols = ['sn', 'polling_station_name', 'area', 'blockcode', 'male', 'female'];
    const missingCols = requiredCols.filter(col => !(col in rows[0]));
    if (missingCols.length > 0) {
      return NextResponse.json({ error: `Missing columns: ${missingCols.join(', ')}. Please fix your file.` }, { status: 400 });
    }
    await connectDB();
    const { default: mongoose } = await import('mongoose');
    const PollingScheme = mongoose.connection.collection('polling_scheme');
    let inserted = 0;
    let skipped = 0;
    let errors: string[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as Record<string, any>;
      if (!row.blockcode || String(row.blockcode).trim() === '') {
        skipped++;
        continue;
      }
      let male = parseInt(row.male) || 0;
      let female = parseInt(row.female) || 0;
      let total = male + female;
      const doc = {
        sn: row.sn,
        polling_station_name: row.polling_station_name,
        area: row.area,
        blockcode: row.blockcode,
        male,
        female,
        total,
        male_booth: row.male_booth || '',
        female_booth: row.female_booth || '',
        total_booth: row.total_booth || '',
        halkaName,
      };
      try {
        await PollingScheme.insertOne(doc);
        inserted++;
      } catch (e: unknown) {
        const err = e as Error;
        errors.push(`Row ${i + 2}: ${err.message}`);
      }
    }
    let msg = `${inserted} rows imported. ${skipped} rows skipped (empty blockcode).`;
    if (errors.length > 0) msg += ' Errors: ' + errors.join('; ');
    return NextResponse.json({ message: msg });
  } catch (e: unknown) {
    const err = e as Error;
    return NextResponse.json({ error: err.message || 'Unknown error.' }, { status: 500 });
  }
} 