import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import * as XLSX from 'xlsx';
import { connectNativeMongoClient } from '@/lib/mongo-client';
import { canAccessHalka, getAllowedHalkaName } from '@/lib/constituency-access';
import type { SessionUser } from '@/lib/auth';
import {
  PHONE_ENRICH_BATCH_SIZE,
  PHONE_ENRICH_MAX_INPUT_ROWS,
  PHONE_ENRICH_MAX_OUTPUT_ROWS,
  enrichInputRows,
  type EnrichedRow,
  type InputRow,
  type PhoneRecordLite,
} from '@/lib/phone-enrich/core';

export type PhoneEnrichJobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface PhoneEnrichJobMeta {
  id: string;
  status: PhoneEnrichJobStatus;
  sourceFileName: string;
  totalInputRows: number;
  processedInputRows: number;
  outputRowCount: number;
  progressPercent: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  error: string | null;
  downloadReady: boolean;
}

function getJobsRoot(): string {
  return path.join(process.cwd(), 'data', 'phone-enrich');
}

function getJobDir(jobId: string): string {
  return path.join(getJobsRoot(), jobId);
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function toJobMeta(raw: PhoneEnrichJobMeta): PhoneEnrichJobMeta {
  const progressPercent =
    raw.totalInputRows > 0
      ? Math.min(100, Math.round((raw.processedInputRows / raw.totalInputRows) * 100))
      : raw.status === 'completed'
        ? 100
        : 0;
  return { ...raw, progressPercent };
}

export async function createPhoneEnrichJob(
  file: File,
  admin: SessionUser,
  sessionUser: SessionUser | null
): Promise<PhoneEnrichJobMeta> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('No sheet found in file');
  }

  const rows = XLSX.utils.sheet_to_json<InputRow>(workbook.Sheets[firstSheetName], { defval: '' });
  if (rows.length === 0) {
    throw new Error('No rows found in the first sheet');
  }
  if (rows.length > PHONE_ENRICH_MAX_INPUT_ROWS) {
    throw new Error(
      `Too many rows (${rows.length}). Max ${PHONE_ENRICH_MAX_INPUT_ROWS} rows in UI upload. Use the CLI for millions.`
    );
  }

  const jobId = randomUUID();
  const jobDir = getJobDir(jobId);
  await fs.mkdir(jobDir, { recursive: true });

  const now = new Date().toISOString();
  const meta: PhoneEnrichJobMeta = {
    id: jobId,
    status: 'pending',
    sourceFileName: file.name,
    totalInputRows: rows.length,
    processedInputRows: 0,
    outputRowCount: 0,
    progressPercent: 0,
    createdBy: admin.email,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    error: null,
    downloadReady: false,
  };

  await writeJson(path.join(jobDir, 'input.json'), rows);
  await writeJson(path.join(jobDir, 'output.json'), [] as EnrichedRow[]);
  await writeJson(path.join(jobDir, 'phone-cache.json'), {} as Record<string, PhoneRecordLite[]>);
  await writeJson(path.join(jobDir, 'meta.json'), meta);
  await writeJson(path.join(jobDir, 'context.json'), {
    allowedHalka: sessionUser ? getAllowedHalkaName(sessionUser) : null,
  });

  return toJobMeta(meta);
}

export async function getPhoneEnrichJob(jobId: string): Promise<PhoneEnrichJobMeta | null> {
  const meta = await readJson<PhoneEnrichJobMeta | null>(path.join(getJobDir(jobId), 'meta.json'), null);
  return meta ? toJobMeta(meta) : null;
}

async function writeResultXlsx(jobDir: string, rows: EnrichedRow[]): Promise<void> {
  const outSheet = XLSX.utils.json_to_sheet(rows);
  const outBook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(outBook, outSheet, 'Enriched');
  const outBuffer = XLSX.write(outBook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  await fs.writeFile(path.join(jobDir, 'result.xlsx'), outBuffer);
}

export async function processPhoneEnrichBatch(
  jobId: string,
  sessionUser: SessionUser | null
): Promise<PhoneEnrichJobMeta | null> {
  const jobDir = getJobDir(jobId);
  const metaPath = path.join(jobDir, 'meta.json');
  const meta = await readJson<PhoneEnrichJobMeta | null>(metaPath, null);
  if (!meta) return null;

  if (meta.status === 'completed' || meta.status === 'failed') {
    return toJobMeta(meta);
  }

  const inputRows = await readJson<InputRow[]>(path.join(jobDir, 'input.json'), []);
  const outputRows = await readJson<EnrichedRow[]>(path.join(jobDir, 'output.json'), []);
  const phoneCacheObj = await readJson<Record<string, PhoneRecordLite[]>>(
    path.join(jobDir, 'phone-cache.json'),
    {}
  );
  const phoneCache = new Map<string, PhoneRecordLite[]>(Object.entries(phoneCacheObj));

  const context = await readJson<{
    allowedHalka?: string | null;
  }>(path.join(jobDir, 'context.json'), {});

  const batch = inputRows.slice(meta.processedInputRows, meta.processedInputRows + PHONE_ENRICH_BATCH_SIZE);
  if (batch.length === 0) {
    const completed: PhoneEnrichJobMeta = {
      ...meta,
      status: 'completed',
      progressPercent: 100,
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      downloadReady: outputRows.length > 0,
    };
    await writeJson(metaPath, completed);
    if (outputRows.length > 0) {
      await writeResultXlsx(jobDir, outputRows);
    }
    return toJobMeta(completed);
  }

  const client = await connectNativeMongoClient();
  const db = client.db('vdp');

  try {
    const updatedMeta: PhoneEnrichJobMeta = {
      ...meta,
      status: 'running',
      updatedAt: new Date().toISOString(),
    };
    await writeJson(metaPath, updatedMeta);

    const allowedHalka = context.allowedHalka ?? (sessionUser ? getAllowedHalkaName(sessionUser) : null);

    const { rows: newRows, outputLimitExceeded } = await enrichInputRows(db, batch, {
      allowedHalka,
      phoneCache,
      canAccessHalka: sessionUser ? (halka) => canAccessHalka(sessionUser, halka) : undefined,
      maxOutputRows: PHONE_ENRICH_MAX_OUTPUT_ROWS - outputRows.length,
    });

    const mergedOutput = [...outputRows, ...newRows];
    await writeJson(path.join(jobDir, 'output.json'), mergedOutput);
    await writeJson(path.join(jobDir, 'phone-cache.json'), Object.fromEntries(phoneCache));

    const processedInputRows = meta.processedInputRows + batch.length;
    const isComplete = processedInputRows >= meta.totalInputRows || outputLimitExceeded;

    if (outputLimitExceeded && !isComplete) {
      const failed: PhoneEnrichJobMeta = {
        ...updatedMeta,
        status: 'failed',
        processedInputRows,
        outputRowCount: mergedOutput.length,
        error:
          `Output exceeded ${PHONE_ENRICH_MAX_OUTPUT_ROWS} rows (CNICs with multiple phone records expand output). ` +
          'Use the CLI utility for large exports.',
        updatedAt: new Date().toISOString(),
        downloadReady: mergedOutput.length > 0,
      };
      await writeJson(metaPath, failed);
      if (mergedOutput.length > 0) {
        await writeResultXlsx(jobDir, mergedOutput);
      }
      return toJobMeta(failed);
    }

    const nextMeta: PhoneEnrichJobMeta = {
      ...updatedMeta,
      processedInputRows,
      outputRowCount: mergedOutput.length,
      status: isComplete ? 'completed' : 'running',
      completedAt: isComplete ? new Date().toISOString() : null,
      downloadReady: isComplete && mergedOutput.length > 0,
      updatedAt: new Date().toISOString(),
    };

    await writeJson(metaPath, nextMeta);

    if (isComplete && mergedOutput.length > 0) {
      await writeResultXlsx(jobDir, mergedOutput);
    }

    return toJobMeta(nextMeta);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Enrichment failed';
    const failed: PhoneEnrichJobMeta = {
      ...meta,
      status: 'failed',
      error: message,
      updatedAt: new Date().toISOString(),
    };
    await writeJson(metaPath, failed);
    return toJobMeta(failed);
  } finally {
    await client.close();
  }
}

export async function getPhoneEnrichResultPath(jobId: string): Promise<string | null> {
  const filePath = path.join(getJobDir(jobId), 'result.xlsx');
  try {
    await fs.access(filePath);
    return filePath;
  } catch {
    return null;
  }
}
