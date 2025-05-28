import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { Readable } from 'stream';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { promises as fs } from 'fs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function parseFile(fileBuffer: Buffer, ext: string): Promise<Record<string, any>[]> {
  if (ext === 'csv') {
    const csv = fileBuffer.toString('utf8');
    const { data, errors } = Papa.parse(csv, { header: true, skipEmptyLines: true });
    if (errors.length > 0) throw new Error('CSV parse error: ' + errors[0].message);
    return data as Record<string, any>[];
  } else {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, any>[];
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

    type PollingSchemeRow = {
      sn: string | number;
      polling_station_name: string;
      area: string;
      blockcode: string;
      male: string | number;
      female: string | number;
      male_booth?: string | number;
      female_booth?: string | number;
      total_booth?: string | number;
    };

    const requiredCols = ['sn', 'polling_station_name', 'area', 'blockcode', 'male', 'female'];
    const missingCols = requiredCols.filter(col => !(col in (rows[0] as PollingSchemeRow)));
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
      const row = rows[i] as PollingSchemeRow;
      if (!row.blockcode || String(row.blockcode).trim() === '') {
        skipped++;
        continue;
      }
      let male = parseInt(String(row.male)) || 0;
      let female = parseInt(String(row.female)) || 0;
      let total = male + female;

      // Determine polling station type based on name
      const stationName = String(row.polling_station_name).toLowerCase();
      let type = 'combined';
      if (stationName.includes('male')) {
        type = 'male';
      } else if (stationName.includes('female')) {
        type = 'female';
      }

      const doc = {
        sn: String(row.sn),
        polling_station_name: row.polling_station_name,
        area: row.area,
        blockcode: row.blockcode,
        male,
        female,
        total,
        male_booth: row.male_booth ? String(row.male_booth) : '',
        female_booth: row.female_booth ? String(row.female_booth) : '',
        total_booth: row.total_booth ? String(row.total_booth) : '',
        halkaName,
        type
      };

      // If it's a combined station, create two records - one for male and one for female
      if (type === 'combined') {
        try {
          // Insert male record
          await PollingScheme.insertOne({
            ...doc,
            type: 'male'
          });
          // Insert female record
          await PollingScheme.insertOne({
            ...doc,
            type: 'female'
          });
          inserted += 2;
        } catch (e: unknown) {
          const err = e as Error;
          errors.push(`Row ${i + 2}: ${err.message}`);
        }
      } else {
        try {
          await PollingScheme.insertOne(doc);
          inserted++;
        } catch (e: unknown) {
          const err = e as Error;
          errors.push(`Row ${i + 2}: ${err.message}`);
        }
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