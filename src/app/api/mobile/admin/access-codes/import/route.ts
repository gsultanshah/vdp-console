import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Constituency from '@/models/Constituency';
import { connectNativeMongoClient, getVdpDb } from '@/lib/mongo-client';
import { requireUserManager } from '@/lib/auth';
import { bulkCreateAccessCodes } from '@/lib/mobile/access-codes';
import {
  parseAccessCodeImportRow,
  parseAccessCodeSpreadsheet,
} from '@/lib/mobile/access-code-import';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function getValidHalkaNames(): Promise<string[]> {
  await connectDB();
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
    return NextResponse.json({ error: 'User management access required' }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const defaultHalkaName = String(formData.get('halkaName') ?? '').trim();

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Excel file is required' }, { status: 400 });
    }

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !['xls', 'xlsx', 'csv'].includes(ext)) {
      return NextResponse.json(
        { error: 'Invalid file format. Upload .xls, .xlsx, or .csv' },
        { status: 400 },
      );
    }

    const validHalkaNames = await getValidHalkaNames();
    const rows = await parseAccessCodeSpreadsheet(Buffer.from(await file.arrayBuffer()), ext);
    if (!rows.length) {
      return NextResponse.json({ error: 'No rows found in file' }, { status: 400 });
    }

    const parsedRows: Array<{
      halkaName: string;
      label: string;
      name?: string;
      phone?: string;
      address?: string;
      comments?: string;
      selectAllBlockCodes?: boolean;
      blockCodes?: string[];
    }> = [];
    const errors: string[] = [];

    for (let index = 0; index < rows.length; index += 1) {
      const rowNumber = index + 2;
      const parsed = parseAccessCodeImportRow(
        rows[index],
        rowNumber,
        defaultHalkaName,
        validHalkaNames,
      );
      if (!parsed.ok) {
        errors.push(parsed.error);
        continue;
      }
      parsedRows.push({
        halkaName: parsed.row.halkaName,
        label: parsed.row.label,
        name: parsed.row.name,
        phone: parsed.row.phone || undefined,
        address: parsed.row.address || undefined,
        comments: parsed.row.comments || undefined,
        selectAllBlockCodes: parsed.row.selectAllBlockCodes,
        blockCodes: parsed.row.blockCodes,
      });
    }

    if (parsedRows.length === 0) {
      return NextResponse.json(
        { error: 'No valid rows to import', errors },
        { status: 400 },
      );
    }

    const client = await connectNativeMongoClient();
    const db = getVdpDb(client);
    try {
      const result = await bulkCreateAccessCodes(
        db,
        parsedRows,
        manager.email,
        manager.name,
      );

      return NextResponse.json({
        message: 'Import completed',
        summary: {
          totalRows: rows.length,
          created: result.created.length,
          errors: errors.length + result.errors.length,
        },
        created: result.created,
        errors: [...errors, ...result.errors],
      });
    } finally {
      await client.close();
    }
  } catch (error) {
    console.error('Mobile access code import failed:', error);
    return NextResponse.json(
      {
        error: 'Failed to import mobile access codes',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
