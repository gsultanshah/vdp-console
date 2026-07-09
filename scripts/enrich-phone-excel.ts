#!/usr/bin/env node
/**
 * Enrich a CNIC list with phone data + voter info.
 *
 * Usage:
 *   tsx scripts/enrich-phone-excel.ts --in ./input.xlsx --out ./out-dir
 *
 * Notes:
 * - Writes XLSX files in parts of 10,000 rows each.
 * - Input should include a CNIC column (header: CNIC/cnic/idcard/nic).
 * - For huge inputs, prefer CSV for memory reasons (still supported).
 */

import fs from 'fs/promises';
import path from 'path';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { loadEnv } from './load-env.mjs';
import { connectNativeMongoClient } from '../src/lib/mongo-client';
import { buildFlexibleCnicRegex, normalizeCnicDigits } from '../src/lib/cnic';
import {
  formatCnicDisplay,
  formatPhoneDisplay,
  isPhoneDataConfigured,
  searchPhoneDataByCnic,
} from '../src/lib/phone-data';

loadEnv();

const PART_SIZE = 10_000;
const CONCURRENCY = 12;

type InputRow = Record<string, unknown>;

function argValue(flag: string): string {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return '';
  return process.argv[idx + 1] ?? '';
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

function getRowCnic(row: InputRow): string {
  const keys = Object.keys(row);
  const map = new Map(keys.map((k) => [normalizeHeader(k), k]));
  const candidates = ['cnic', 'idcard', 'nic', 'cnicnumber'];
  for (const c of candidates) {
    const key = map.get(normalizeHeader(c));
    if (key) {
      const val = row[key];
      if (val != null) return String(val);
    }
  }
  for (const key of keys) {
    const digits = String(row[key] ?? '').replace(/\D/g, '');
    if (digits.length === 13) return String(row[key]);
  }
  return '';
}

function safeString(value: unknown): string {
  return value == null ? '' : String(value);
}

async function readInputRows(filePath: string): Promise<InputRow[]> {
  const ext = path.extname(filePath).toLowerCase().replace('.', '');
  const buffer = await fs.readFile(filePath);

  if (ext === 'csv') {
    const parsed = Papa.parse(buffer.toString('utf8'), { header: true, skipEmptyLines: true });
    return (parsed.data as InputRow[]).filter(Boolean);
  }

  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const first = workbook.SheetNames[0];
  if (!first) return [];
  return XLSX.utils.sheet_to_json<InputRow>(workbook.Sheets[first], { defval: '' });
}

async function writePart(outDir: string, partIndex: number, rows: Record<string, string>[]) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Enriched');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  const fileName = `phone-enriched-part-${String(partIndex + 1).padStart(4, '0')}.xlsx`;
  await fs.writeFile(path.join(outDir, fileName), buf);
  return fileName;
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

async function phoneRecordsForCnic(
  cnicDigits: string,
  cache: Map<string, PhoneRecordLite[]>
): Promise<PhoneRecordLite[]> {
  if (!cnicDigits) return [];
  if (cache.has(cnicDigits)) return cache.get(cnicDigits)!;
  if (!isPhoneDataConfigured()) {
    cache.set(cnicDigits, []);
    return [];
  }
  try {
    const records = await searchPhoneDataByCnic(cnicDigits);
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
    cache.set(cnicDigits, mapped);
    return mapped;
  } catch {
    cache.set(cnicDigits, []);
    return [];
  }
}

async function voterForCnic(db: import('mongodb').Db, cnicDigits: string): Promise<Record<string, unknown> | null> {
  const pattern = buildFlexibleCnicRegex(cnicDigits);
  if (!pattern) return null;
  return db.collection('voters').findOne(
    { cnic: { $regex: pattern, $options: 'i' } },
    {
      projection: {
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
    }
  );
}

async function mapLimit<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length) as R[];
  let index = 0;
  const workers = new Array(Math.min(concurrency, items.length)).fill(0).map(async () => {
    while (true) {
      const current = index;
      index += 1;
      if (current >= items.length) return;
      results[current] = await fn(items[current]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  const inputPath = argValue('--in');
  const outDir = argValue('--out') || path.resolve(process.cwd(), 'phone-enriched-output');
  const includeVoter = !hasFlag('--no-voter');

  if (!inputPath) {
    console.log('Usage: tsx scripts/enrich-phone-excel.ts --in <file.xlsx|file.csv> --out <dir> [--no-voter]');
    process.exit(1);
  }

  await fs.mkdir(outDir, { recursive: true });
  console.log(`Reading ${inputPath}...`);
  const inputRows = await readInputRows(inputPath);
  console.log(`Loaded ${inputRows.length.toLocaleString()} rows`);

  const client = await connectNativeMongoClient();
  const db = client.db('vdp');
  const phoneCache = new Map<string, PhoneRecordLite[]>();

  try {
    let partIndex = 0;
    let bufferRows: Record<string, string>[] = [];

    const flush = async () => {
      if (bufferRows.length === 0) return;
      const fileName = await writePart(outDir, partIndex, bufferRows);
      console.log(`Wrote ${fileName} (${bufferRows.length} rows)`);
      bufferRows = [];
      partIndex += 1;
    };

    for (let offset = 0; offset < inputRows.length; offset += PART_SIZE) {
      const chunk = inputRows.slice(offset, offset + PART_SIZE);

      const mapped = await mapLimit(chunk, CONCURRENCY, async (row) => {
        const raw = getRowCnic(row);
        const digits = normalizeCnicDigits(String(raw ?? '')).slice(0, 13);
        const cnicDisplay = digits ? formatCnicDisplay(digits) : safeString(raw);
        const voter = includeVoter && digits ? await voterForCnic(db, digits) : null;
        const base = {
          CNIC: cnicDisplay,
          Name: voter ? safeString(voter.name) : '',
          Address: voter ? safeString(voter.address) : '',
          Halka: voter ? safeString(voter.halkaName) : '',
          BlockCode: voter ? safeString(voter.blockCode) : '',
          SilsilaNo: voter ? safeString(voter.silsilaNo) : '',
          GharanaNo: voter ? safeString(voter.gharanaNo) : '',
          FatherName: voter ? safeString(voter.fatherName) : '',
          Profession: voter ? safeString(voter.profession) : '',
          Age: voter ? safeString(voter.age) : '',
          PreviousAddress: voter ? safeString(voter.previousAddress) : '',
        };

        if (!digits) {
          return [
            {
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
            },
          ];
        }

        const phoneRecords = await phoneRecordsForCnic(digits, phoneCache);
        if (phoneRecords.length === 0) {
          return [
            {
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
            },
          ];
        }

        return phoneRecords.map((record) => ({
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
        }));
      });

      for (const entry of mapped) {
        for (const row of entry) {
          bufferRows.push(row);
          if (bufferRows.length >= PART_SIZE) {
            await flush();
          }
        }
      }
    }

    await flush();
    console.log('Done.');
  } finally {
    await client.close();
  }
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});

