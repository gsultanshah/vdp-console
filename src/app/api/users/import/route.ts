import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import Constituency from '@/models/Constituency';
import {
  forbiddenResponse,
  requireUserManager,
  unauthorizedResponse,
} from '@/lib/auth';
import {
  formatUser,
  parseImportUserRow,
  resolveConstituencyAccessForSave,
} from '@/lib/user-management';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function parseSpreadsheet(fileBuffer: Buffer, ext: string): Promise<Record<string, unknown>[]> {
  if (ext === 'csv') {
    const csv = fileBuffer.toString('utf8');
    const { data, errors } = Papa.parse<Record<string, unknown>>(csv, {
      header: true,
      skipEmptyLines: true,
    });
    if (errors.length > 0) {
      throw new Error(`CSV parse error: ${errors[0].message}`);
    }
    return data;
  }

  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[];
}

async function getValidHalkaNames(): Promise<string[]> {
  const constituencies = await Constituency.find({
    deletedAt: null,
    status: 'active',
  })
    .select('halkaName')
    .lean();

  return constituencies.map((item) => String(item.halkaName));
}

export async function POST(request: Request) {
  const manager = requireUserManager(request);
  if (!manager) {
    const user = request.headers.get('cookie')?.includes('user=');
    return user ? forbiddenResponse() : unauthorizedResponse();
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const defaultConstituencyAccess = String(formData.get('constituencyAccess') || 'all');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Excel file is required' }, { status: 400 });
    }

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !['xls', 'xlsx', 'csv'].includes(ext)) {
      return NextResponse.json(
        { error: 'Invalid file format. Upload .xls, .xlsx, or .csv' },
        { status: 400 }
      );
    }

    await connectDB();
    const validHalkaNames = await getValidHalkaNames();
    const resolvedDefault =
      resolveConstituencyAccessForSave('user', defaultConstituencyAccess, validHalkaNames) ??
      'all';

    const rows = await parseSpreadsheet(Buffer.from(await file.arrayBuffer()), ext);
    if (!rows.length) {
      return NextResponse.json({ error: 'No rows found in file' }, { status: 400 });
    }

    const created: ReturnType<typeof formatUser>[] = [];
    const skipped: Array<{ row: number; email: string; reason: string }> = [];
    const errors: string[] = [];

    for (let index = 0; index < rows.length; index += 1) {
      const rowNumber = index + 2;
      const parsed = parseImportUserRow(rows[index], rowNumber, resolvedDefault, validHalkaNames);

      if (!parsed.ok) {
        errors.push(parsed.error);
        continue;
      }

      const existingUser = await User.findOne({ email: parsed.user.email });
      if (existingUser) {
        skipped.push({
          row: rowNumber,
          email: parsed.user.email,
          reason: 'Email already exists',
        });
        continue;
      }

      const user = await User.create({
        name: parsed.user.name,
        email: parsed.user.email,
        password: parsed.user.password,
        role: parsed.user.role,
        constituencyAccess: parsed.user.constituencyAccess,
        updatedAt: new Date(),
      });

      await User.updateOne(
        { _id: user._id },
        { $set: { constituencyAccess: parsed.user.constituencyAccess } }
      );
      user.constituencyAccess = parsed.user.constituencyAccess;

      created.push(formatUser(user));
    }

    return NextResponse.json({
      message: 'Import completed',
      summary: {
        totalRows: rows.length,
        created: created.length,
        skipped: skipped.length,
        errors: errors.length,
      },
      created,
      skipped,
      errors,
    });
  } catch (error) {
    console.error('User import failed:', error);
    return NextResponse.json(
      {
        error: 'Failed to import users',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
