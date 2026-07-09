import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { forbiddenResponse, requireAdmin, unauthorizedResponse } from '@/lib/auth';
import { connectNativeMongoClient } from '@/lib/mongo-client';
import { buildFlexibleCnicRegex } from '@/lib/cnic';
import { canAccessHalka, getAllowedHalkaName, normalizeHalkaForCompare } from '@/lib/constituency-access';
import { resolveSessionUser } from '@/lib/session-user';
import {
  formatCnicDisplay,
  formatPhoneDisplay,
  isPhoneDataConfigured,
  normalizeCnicDigits,
  searchPhoneDataByCnic,
} from '@/lib/phone-data';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_ROWS = 10_000;

type InputRow = Record<string, unknown>;

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

function getRowCnic(row: InputRow): string {
  const keys = Object.keys(row);
  const map = new Map(keys.map((k) => [normalizeHeader(k), k]));
  const candidates = ['cnic', 'idcard', 'nic', 'شناختی کارڈ', 'شناختیکارڈ', 'شناختی_کارڈ', 'cnicnumber'];
  for (const c of candidates) {
    const key = map.get(normalizeHeader(c));
    if (key) {
      const val = row[key];
      if (val != null) return String(val);
    }
  }
  // fallback: first column that looks like CNIC digits
  for (const key of keys) {
    const digits = String(row[key] ?? '').replace(/\D/g, '');
    if (digits.length === 13) return String(row[key]);
  }
  return '';
}

function getRowHalka(row: InputRow): string {
  const keys = Object.keys(row);
  const map = new Map(keys.map((k) => [normalizeHeader(k), k]));
  const key = map.get('halka') ?? map.get('halkaname') ?? map.get('constituency');
  if (!key) return '';
  return String(row[key] ?? '');
}

function safeString(value: unknown): string {
  return value == null ? '' : String(value);
}

type PhoneRecordLite = {
  phone: string;
  phoneDisplay: string;
  firstname: string;
  gender: string;
  address1: string;
  address2: string;
  address3: string;
  sourceFile: string;
  dataJson: string;
};

async function lookupPhoneRecords(
  cnic: string,
  cache: Map<string, PhoneRecordLite[]>
): Promise<PhoneRecordLite[]> {
  const normalized = normalizeCnicDigits(cnic);
  if (!normalized) return [];
  if (cache.has(normalized)) return cache.get(normalized)!;

  if (!isPhoneDataConfigured()) {
    cache.set(normalized, []);
    return [];
  }

  try {
    const records = await searchPhoneDataByCnic(normalized);
    const mapped = records.map((r) => ({
      phone: r.phone,
      phoneDisplay: formatPhoneDisplay(r.phone),
      firstname: safeString(r.firstname),
      gender: safeString(r.gender),
      address1: safeString(r.address1),
      address2: safeString(r.address2),
      address3: safeString(r.address3),
      sourceFile: safeString(r.sourceFile),
      dataJson: (() => {
        try {
          return JSON.stringify(r.data ?? {});
        } catch {
          return '';
        }
      })(),
    }));
    cache.set(normalized, mapped);
    return mapped;
  } catch {
    cache.set(normalized, []);
    return [];
  }
}

async function lookupVoterByCnic(
  db: import('mongodb').Db,
  cnic: string,
  allowedHalka: string | null,
  rowHalka: string
): Promise<Record<string, unknown> | null> {
  const pattern = buildFlexibleCnicRegex(cnic);
  if (!pattern) return null;
  const query: Record<string, unknown> = { cnic: { $regex: pattern, $options: 'i' } };
  const halka = rowHalka.trim();
  if (halka) {
    query.halkaName = normalizeHalkaForCompare(halka);
  } else if (allowedHalka) {
    query.halkaName = allowedHalka;
  }
  return db.collection('voters').findOne(query, {
    projection: {
      _id: 1,
      cnic: 1,
      halkaName: 1,
      blockCode: 1,
      silsilaNo: 1,
      gharanaNo: 1,
      name: 1,
      fatherName: 1,
      profession: 1,
      age: 1,
      address: 1,
      previousAddress: 1,
    },
  });
}

export async function POST(request: Request) {
  const admin = requireAdmin(request);
  if (!admin) {
    const hasSession = request.headers.get('cookie')?.includes('user=');
    return hasSession ? forbiddenResponse() : unauthorizedResponse();
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return NextResponse.json({ error: 'No sheet found in file' }, { status: 400 });
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<InputRow>(sheet, { defval: '' });
  if (rows.length === 0) {
    return NextResponse.json({ error: 'No rows found in the first sheet' }, { status: 400 });
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `Too many rows (${rows.length}). Max ${MAX_ROWS} rows in UI upload. Use the CLI for millions.` },
      { status: 400 }
    );
  }

  const sessionUser = await resolveSessionUser(request);
  const allowedHalka = getAllowedHalkaName(sessionUser);

  const client = await connectNativeMongoClient();
  const db = client.db('vdp');

  try {
    const phoneCache = new Map<string, PhoneRecordLite[]>();

    const outRows: Record<string, string>[] = [];

    for (const row of rows) {
      const inputCnicRaw = getRowCnic(row);
      const inputCnicDigits = normalizeCnicDigits(String(inputCnicRaw ?? ''));
      const halkaFromRow = getRowHalka(row);

      const cnicDisplay = inputCnicDigits ? formatCnicDisplay(inputCnicDigits) : safeString(inputCnicRaw);

      // Access check if input includes a halka column.
      if (halkaFromRow.trim() && sessionUser && !canAccessHalka(sessionUser, halkaFromRow)) {
        outRows.push({
          CNIC: cnicDisplay,
          Phone: '',
          Name: '',
          Address: '',
          Halka: halkaFromRow,
          BlockCode: '',
          SilsilaNo: '',
          GharanaNo: '',
          FatherName: '',
          Profession: '',
          Age: '',
          PreviousAddress: '',
          Error: 'Forbidden halka',
        });
        continue;
      }

      const phoneRecords = inputCnicDigits ? await lookupPhoneRecords(inputCnicDigits, phoneCache) : [];
      const voter = inputCnicDigits
        ? await lookupVoterByCnic(db, inputCnicDigits, allowedHalka, halkaFromRow)
        : null;

      const base = {
        CNIC: cnicDisplay,
        Name: voter ? safeString(voter.name) : '',
        Address: voter ? safeString(voter.address) : '',
        Halka: voter ? safeString(voter.halkaName) : halkaFromRow,
        BlockCode: voter ? safeString(voter.blockCode) : '',
        SilsilaNo: voter ? safeString(voter.silsilaNo) : '',
        GharanaNo: voter ? safeString(voter.gharanaNo) : '',
        FatherName: voter ? safeString(voter.fatherName) : '',
        Profession: voter ? safeString(voter.profession) : '',
        Age: voter ? safeString(voter.age) : '',
        PreviousAddress: voter ? safeString(voter.previousAddress) : '',
      };

      if (!inputCnicDigits) {
        outRows.push({
          ...base,
          Phone: '',
          PhoneDisplay: '',
          PhoneFirstname: '',
          PhoneGender: '',
          PhoneAddress1: '',
          PhoneAddress2: '',
          PhoneAddress3: '',
          PhoneSourceFile: '',
          PhoneDataJson: '',
          Error: 'Invalid CNIC',
        });
        continue;
      }

      if (phoneRecords.length === 0) {
        outRows.push({
          ...base,
          Phone: '',
          PhoneDisplay: '',
          PhoneFirstname: '',
          PhoneGender: '',
          PhoneAddress1: '',
          PhoneAddress2: '',
          PhoneAddress3: '',
          PhoneSourceFile: '',
          PhoneDataJson: '',
          Error: '',
        });
        continue;
      }

      for (const record of phoneRecords) {
        outRows.push({
          ...base,
          Phone: record.phone,
          PhoneDisplay: record.phoneDisplay,
          PhoneFirstname: record.firstname,
          PhoneGender: record.gender,
          PhoneAddress1: record.address1,
          PhoneAddress2: record.address2,
          PhoneAddress3: record.address3,
          PhoneSourceFile: record.sourceFile,
          PhoneDataJson: record.dataJson,
          Error: '',
        });
        if (outRows.length > MAX_ROWS) {
          return NextResponse.json(
            {
              error:
                `Output exceeded ${MAX_ROWS} rows (CNICs with multiple phone records expand output). ` +
                'Use the CLI utility for large exports.',
            },
            { status: 400 }
          );
        }
      }
    }

    const outSheet = XLSX.utils.json_to_sheet(outRows);
    const outBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(outBook, outSheet, 'Enriched');
    const outBuffer = XLSX.write(outBook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    return new NextResponse(outBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="phone-enriched.xlsx"',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to enrich spreadsheet';
    console.error('Enrich excel failed:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await client.close();
  }
}

