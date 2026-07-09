#!/usr/bin/env node
/**
 * Enrich a CNIC list with phone data + voter info.
 *
 * Usage:
 *   tsx scripts/enrich-phone-excel.ts --in ./input.xlsx --out ./out-dir
 */

import fs from 'fs/promises';
import path from 'path';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { loadEnv } from './load-env.mjs';
import { connectNativeMongoClient } from '../src/lib/mongo-client';
import {
  PHONE_ENRICH_CLI_PART_SIZE,
  enrichInputRows,
  type InputRow,
  type PhoneRecordLite,
} from '../src/lib/phone-enrich/core';

loadEnv();

const PROGRESS_CHUNK = 100;
const CONCURRENCY = 12;

function argValue(flag: string): string {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return '';
  return process.argv[idx + 1] ?? '';
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
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

function renderProgress(
  processedInput: number,
  totalInput: number,
  outputRows: number,
  partIndex: number
): void {
  const pct = totalInput > 0 ? Math.min(100, Math.round((processedInput / totalInput) * 100)) : 100;
  const filled = Math.floor(pct / 5);
  const bar = `${'='.repeat(filled)}${' '.repeat(20 - filled)}`;
  const line = `[${bar}] ${String(pct).padStart(3)}%  input ${processedInput.toLocaleString()}/${totalInput.toLocaleString()}  output ${outputRows.toLocaleString()}  part ${partIndex + 1}`;
  if (process.stdout.isTTY) {
    process.stdout.write(`\r${line}`);
  } else {
    console.log(line);
  }
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
  const totalInput = inputRows.length;
  console.log(`Loaded ${totalInput.toLocaleString()} rows`);

  const client = await connectNativeMongoClient();
  const db = client.db('vdp');
  const phoneCache = new Map<string, PhoneRecordLite[]>();

  let partIndex = 0;
  let bufferRows: Record<string, string>[] = [];
  let processedInput = 0;
  let outputRows = 0;

  const flush = async () => {
    if (bufferRows.length === 0) return;
    const fileName = await writePart(outDir, partIndex, bufferRows);
    if (process.stdout.isTTY) process.stdout.write('\n');
    console.log(`Wrote ${fileName} (${bufferRows.length.toLocaleString()} rows)`);
    bufferRows = [];
    partIndex += 1;
  };

  try {
    for (let offset = 0; offset < inputRows.length; offset += PROGRESS_CHUNK) {
      const chunk = inputRows.slice(offset, offset + PROGRESS_CHUNK);
      const { rows: enriched } = await enrichInputRows(db, chunk, {
        allowedHalka: null,
        phoneCache,
        maxOutputRows: Number.MAX_SAFE_INTEGER,
      });

      if (!includeVoter) {
        for (const row of enriched) {
          row.Name = '';
          row.Address = '';
          row.Halka = '';
          row.BlockCode = '';
          row.SilsilaNo = '';
          row.GharanaNo = '';
          row.FatherName = '';
          row.Profession = '';
          row.Age = '';
          row.PreviousAddress = '';
        }
      }

      processedInput += chunk.length;
      for (const row of enriched) {
        bufferRows.push(row);
        outputRows += 1;
        if (bufferRows.length >= PHONE_ENRICH_CLI_PART_SIZE) {
          await flush();
        }
      }

      renderProgress(processedInput, totalInput, outputRows, partIndex);
    }

    await flush();
    if (process.stdout.isTTY) process.stdout.write('\n');
    console.log(
      `Done. ${processedInput.toLocaleString()} CNICs processed → ${outputRows.toLocaleString()} output rows in ${partIndex} file(s).`
    );
  } finally {
    await client.close();
  }
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
