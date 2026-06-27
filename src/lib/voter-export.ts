import fs from 'fs/promises';
import path from 'path';
import { MongoClient, ObjectId, type Document } from 'mongodb';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import connectDB from '@/lib/mongodb';
import ExportJob, { type BlockCodeProgressDoc, type ExportJobDoc, type OutputFileDoc } from '@/models/ExportJob';
import Constituency from '@/models/Constituency';
import {
  DEFAULT_EXPORT_FIELD_IDS,
  EXPORT_BATCH_SIZE,
  EXPORT_STALE_MS,
  MAX_EXPORT_FILE_BYTES,
  MAX_EXPORT_FILE_MB,
  exportFieldLabel,
  normalizeExportFields,
  type ExportFormat,
  type ExportMode,
} from '@/lib/export-fields';
import {
  formatCnicDisplay,
  formatPhoneDisplay,
  isPhoneDataConfigured,
  searchPhoneDataByCnic,
} from '@/lib/phone-data';

export interface CreateExportJobInput {
  halkaNames: string[];
  blockCodes: string[];
  selectAllBlockCodes?: boolean;
  fields?: string[];
  format?: ExportFormat;
  mode?: ExportMode;
  createdBy: string;
  createdByName?: string;
}

export interface ExportJobSummary {
  _id: string;
  status: string;
  createdBy: string;
  createdByName: string;
  halkaNames: string[];
  blockCodes: string[];
  fields: string[];
  format: ExportFormat;
  mode: ExportMode;
  totalVoters: number;
  processedVoters: number;
  progressPercent: number;
  currentBlockCode: string | null;
  outputFiles: ExportJobDoc['outputFiles'];
  combinedFileName: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  resumable: boolean;
}

function getExportsRoot(): string {
  return path.join(process.cwd(), 'data', 'exports');
}

function getJobDir(jobId: string): string {
  return path.join(getExportsRoot(), jobId);
}

async function ensureJobDir(jobId: string): Promise<string> {
  const dir = getJobDir(jobId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

function toSummary(job: ExportJobDoc): ExportJobSummary {
  const progressPercent =
    job.totalVoters > 0 ? Math.min(100, Math.round((job.processedVoters / job.totalVoters) * 100)) : 0;
  const currentBlock = job.blockCodeProgress[job.currentBlockIndex];

  const resumable = ['pending', 'running', 'failed'].includes(job.status);

  return {
    _id: String(job._id),
    status: job.status,
    createdBy: job.createdBy,
    createdByName: job.createdByName,
    halkaNames: job.halkaNames,
    blockCodes: job.blockCodes,
    fields: job.fields,
    format: job.format,
    mode: job.mode,
    totalVoters: job.totalVoters,
    processedVoters: job.processedVoters,
    progressPercent,
    currentBlockCode: currentBlock?.blockCode ?? null,
    outputFiles: job.outputFiles,
    combinedFileName: job.combinedFileName,
    error: job.error,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null,
    resumable,
  };
}

function asExportJobDoc(value: unknown): ExportJobDoc {
  return value as ExportJobDoc;
}

async function resolveBlockCodes(input: CreateExportJobInput): Promise<{
  halkaNames: string[];
  blockCodes: string[];
  blockEntries: Array<{ blockCode: string; halkaName: string }>;
}> {
  await connectDB();

  const halkaNames = Array.from(new Set(input.halkaNames.map((name) => name.trim()).filter(Boolean)));
  if (!halkaNames.length) {
    throw new Error('Select at least one constituency');
  }

  const constituencies = await Constituency.find({
    halkaName: { $in: halkaNames },
    deletedAt: null,
  })
    .select('halkaName blockCodes')
    .lean();

  if (!constituencies.length) {
    throw new Error('No constituencies found for the selected halka names');
  }

  const blockEntries: Array<{ blockCode: string; halkaName: string }> = [];
  const seen = new Set<string>();

  if (input.mode === 'default_per_blockcode' || input.selectAllBlockCodes) {
    for (const constituency of constituencies) {
      for (const blockCode of constituency.blockCodes ?? []) {
        const key = `${constituency.halkaName}:${blockCode}`;
        if (!seen.has(key)) {
          seen.add(key);
          blockEntries.push({ blockCode, halkaName: constituency.halkaName });
        }
      }
    }
  } else {
    const selected = Array.from(new Set(input.blockCodes.map((code) => code.trim()).filter(Boolean)));
    if (!selected.length) {
      throw new Error('Select at least one block code');
    }

    for (const blockCode of selected) {
      const owner = constituencies.find((item) => (item.blockCodes ?? []).includes(blockCode));
      if (!owner) {
        throw new Error(`Block code ${blockCode} is not in the selected constituencies`);
      }
      const key = `${owner.halkaName}:${blockCode}`;
      if (!seen.has(key)) {
        seen.add(key);
        blockEntries.push({ blockCode, halkaName: owner.halkaName });
      }
    }
  }

  if (!blockEntries.length) {
    throw new Error('No block codes available for export');
  }

  blockEntries.sort((a, b) =>
    a.halkaName === b.halkaName ? a.blockCode.localeCompare(b.blockCode) : a.halkaName.localeCompare(b.halkaName)
  );

  return {
    halkaNames,
    blockCodes: blockEntries.map((entry) => entry.blockCode),
    blockEntries,
  };
}

async function countVotersForBlocks(
  blockEntries: Array<{ blockCode: string; halkaName: string }>
): Promise<Map<string, number>> {
  const client = await MongoClient.connect(process.env.NEXT_PUBLIC_MONGODB_URI!);
  const db = client.db();
  const counts = new Map<string, number>();

  try {
    for (const entry of blockEntries) {
      const count = await db.collection('voters').countDocuments({
        blockCode: entry.blockCode,
        halkaName: entry.halkaName,
      });
      counts.set(`${entry.halkaName}:${entry.blockCode}`, count);
    }
  } finally {
    await client.close();
  }

  return counts;
}

export async function createExportJob(input: CreateExportJobInput): Promise<ExportJobSummary> {
  const mode = input.mode ?? 'custom';
  const format = input.format ?? 'csv';
  const fields =
    mode === 'default_per_blockcode' ? [...DEFAULT_EXPORT_FIELD_IDS] : normalizeExportFields(input.fields);

  const { halkaNames, blockCodes, blockEntries } = await resolveBlockCodes({
    ...input,
    mode,
  });

  const voterCounts = await countVotersForBlocks(blockEntries);
  const blockCodeProgress: BlockCodeProgressDoc[] = blockEntries.map((entry) => ({
    blockCode: entry.blockCode,
    halkaName: entry.halkaName,
    totalVoters: voterCounts.get(`${entry.halkaName}:${entry.blockCode}`) ?? 0,
    processedVoters: 0,
    lastVoterId: null,
    status: 'pending',
    fileName: null,
    filePath: null,
    fileSizeBytes: 0,
    rowCount: 0,
    error: null,
  }));

  const totalVoters =
    mode === 'custom'
      ? blockCodeProgress.reduce((sum, item) => sum + item.totalVoters, 0)
      : blockCodeProgress.reduce((sum, item) => sum + item.totalVoters, 0);

  const job = await ExportJob.create({
    status: 'pending',
    createdBy: input.createdBy,
    createdByName: input.createdByName ?? '',
    halkaNames,
    blockCodes,
    selectAllBlockCodes: Boolean(input.selectAllBlockCodes || mode === 'default_per_blockcode'),
    fields,
    format,
    mode,
    totalVoters,
    processedVoters: 0,
    currentBlockIndex: 0,
    blockCodeProgress,
    outputFiles: [],
    combinedFilePath: null,
    combinedFileName: null,
    combinedLastVoterId: null,
    combinedRowCount: 0,
    combinedFileSizeBytes: 0,
    error: null,
  });

  await ensureJobDir(String(job._id));
  return toSummary(asExportJobDoc(job.toObject()));
}

export async function listExportJobs(limit = 20): Promise<ExportJobSummary[]> {
  await connectDB();
  const jobs = await ExportJob.find({}).sort({ createdAt: -1 }).limit(limit).lean();
  return jobs.map((job) => toSummary(asExportJobDoc(job)));
}

export async function getExportJob(jobId: string): Promise<ExportJobSummary | null> {
  await connectDB();
  if (!ObjectId.isValid(jobId)) {
    return null;
  }
  const job = await ExportJob.findById(jobId).lean();
  if (!job) {
    return null;
  }
  return toSummary(asExportJobDoc(job));
}

async function getPhoneNumbersForCnic(
  cnic: string,
  cache: Map<string, string>
): Promise<string> {
  const normalized = cnic.replace(/\D/g, '');
  if (cache.has(normalized)) {
    return cache.get(normalized)!;
  }

  if (!isPhoneDataConfigured()) {
    cache.set(normalized, '');
    return '';
  }

  try {
    const records = await searchPhoneDataByCnic(cnic);
    const phones = records
      .map((record) => formatPhoneDisplay(record.phone))
      .filter(Boolean)
      .join('; ');
    cache.set(normalized, phones);
    return phones;
  } catch {
    cache.set(normalized, '');
    return '';
  }
}

function voterFieldValue(voter: Document, fieldId: string, phoneValue: string): string {
  switch (fieldId) {
    case 'phone':
      return phoneValue;
    case 'cnic':
      return voter.cnic ? formatCnicDisplay(String(voter.cnic).replace(/\D/g, '')) : '';
    default: {
      const value = voter[fieldId];
      return value != null ? String(value) : '';
    }
  }
}

function buildRow(
  voter: Document,
  fields: string[],
  phoneValue: string
): Record<string, string> {
  const row: Record<string, string> = {};
  for (const fieldId of fields) {
    row[exportFieldLabel(fieldId)] = voterFieldValue(voter, fieldId, phoneValue);
  }
  return row;
}

async function appendCsvRows(
  filePath: string,
  fields: string[],
  rows: Record<string, string>[]
): Promise<number> {
  if (!rows.length) {
    return (await fs.stat(filePath).catch(() => null))?.size ?? 0;
  }

  const headers = fields.map(exportFieldLabel);
  const exists = await fs
    .access(filePath)
    .then(() => true)
    .catch(() => false);

  const csvBody = Papa.unparse(rows, {
    columns: headers,
    header: !exists,
  });

  await fs.appendFile(filePath, exists ? `\n${csvBody}` : csvBody, 'utf8');
  const stats = await fs.stat(filePath);
  return stats.size;
}

async function convertCsvToXlsx(csvPath: string, xlsxPath: string): Promise<void> {
  const csvContent = await fs.readFile(csvPath, 'utf8');
  const parsed = Papa.parse<Record<string, string>>(csvContent, { header: true, skipEmptyLines: true });
  const worksheet = XLSX.utils.json_to_sheet(parsed.data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Export');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  await fs.writeFile(xlsxPath, buffer);
}

async function finalizeBlockFile(
  job: ExportJobDoc,
  block: BlockCodeProgressDoc,
  jobDir: string
): Promise<{ fileName: string; filePath: string; sizeBytes: number; rowCount: number } | null> {
  const baseName = block.blockCode;
  const csvPath = path.join(jobDir, `${baseName}.csv`);

  const csvExists = await fs
    .access(csvPath)
    .then(() => true)
    .catch(() => false);

  if (!csvExists) {
    const headers = job.fields.map(exportFieldLabel).join(',');
    await fs.writeFile(csvPath, `${headers}\n`, 'utf8');
  }

  let finalPath = csvPath;
  let finalName = `${baseName}.csv`;

  if (job.format === 'xlsx') {
    finalPath = path.join(jobDir, `${baseName}.xlsx`);
    finalName = `${baseName}.xlsx`;
    await convertCsvToXlsx(csvPath, finalPath);
    if (job.mode === 'default_per_blockcode') {
      await fs.unlink(csvPath).catch(() => undefined);
    }
  }

  const stats = await fs.stat(finalPath);
  return {
    fileName: finalName,
    filePath: finalPath,
    sizeBytes: stats.size,
    rowCount: block.rowCount,
  };
}

async function finalizeCombinedFile(
  job: ExportJobDoc,
  jobDir: string
): Promise<{ fileName: string; filePath: string; sizeBytes: number; rowCount: number } | null> {
  const csvPath = job.combinedFilePath ?? path.join(jobDir, 'export.csv');
  const csvExists = await fs
    .access(csvPath)
    .then(() => true)
    .catch(() => false);

  if (!csvExists) {
    return null;
  }

  let finalPath = csvPath;
  let finalName = 'export.csv';

  if (job.format === 'xlsx') {
    finalPath = path.join(jobDir, 'export.xlsx');
    finalName = 'export.xlsx';
    await convertCsvToXlsx(csvPath, finalPath);
    await fs.unlink(csvPath).catch(() => undefined);
  }

  const stats = await fs.stat(finalPath);
  return {
    fileName: finalName,
    filePath: finalPath,
    sizeBytes: stats.size,
    rowCount: job.combinedRowCount,
  };
}

async function fetchVoterBatch(
  block: BlockCodeProgressDoc | null,
  job: ExportJobDoc,
  limit: number
): Promise<Document[]> {
  const client = await MongoClient.connect(process.env.NEXT_PUBLIC_MONGODB_URI!);
  const db = client.db();

  try {
    if (job.mode === 'custom') {
      const query: Record<string, unknown> = {
        halkaName: { $in: job.halkaNames },
        blockCode: { $in: job.blockCodes },
      };
      if (job.combinedLastVoterId && ObjectId.isValid(job.combinedLastVoterId)) {
        query._id = { $gt: new ObjectId(job.combinedLastVoterId) };
      }

      return await db
        .collection('voters')
        .find(query)
        .sort({ _id: 1 })
        .limit(limit)
        .toArray();
    }

    if (!block) {
      return [];
    }

    const query: Record<string, unknown> = {
      blockCode: block.blockCode,
      halkaName: block.halkaName,
    };
    if (block.lastVoterId && ObjectId.isValid(block.lastVoterId)) {
      query._id = { $gt: new ObjectId(block.lastVoterId) };
    }

    return await db
      .collection('voters')
      .find(query)
      .sort({ _id: 1 })
      .limit(limit)
      .toArray();
  } finally {
    await client.close();
  }
}

export async function processExportBatch(jobId: string): Promise<ExportJobSummary | null> {
  await connectDB();
  if (!ObjectId.isValid(jobId)) {
    return null;
  }

  const jobDoc = await ExportJob.findById(jobId);
  if (!jobDoc) {
    return null;
  }

  const job = asExportJobDoc(jobDoc.toObject());

  if (job.status === 'completed' || job.status === 'cancelled') {
    return toSummary(job);
  }

  if (job.status === 'running') {
    const stale = Date.now() - new Date(job.updatedAt).getTime() > EXPORT_STALE_MS;
    if (!stale) {
      return toSummary(job);
    }
  }

  jobDoc.status = 'running';
  jobDoc.error = null;
  await jobDoc.save();

  const jobDir = await ensureJobDir(jobId);
  const phoneCache = new Map<string, string>();
  const includePhone = job.fields.includes('phone');

  try {
    if (job.mode === 'custom') {
      const csvPath = job.combinedFilePath ?? path.join(jobDir, 'export.csv');
      if (!job.combinedFilePath) {
        jobDoc.combinedFilePath = csvPath;
        jobDoc.combinedFileName = job.format === 'xlsx' ? 'export.xlsx' : 'export.csv';
        await jobDoc.save();
      }

      const voters = await fetchVoterBatch(null, job, EXPORT_BATCH_SIZE);
      if (!voters.length) {
        const finalized = await finalizeCombinedFile(jobDoc.toObject() as ExportJobDoc, jobDir);
        if (finalized) {
          jobDoc.outputFiles = [
            {
              blockCode: null,
              halkaName: null,
              fileName: finalized.fileName,
              filePath: finalized.filePath,
              sizeBytes: finalized.sizeBytes,
              rowCount: finalized.rowCount,
            },
          ];
          jobDoc.combinedFileName = finalized.fileName;
          jobDoc.combinedFileSizeBytes = finalized.sizeBytes;
          jobDoc.combinedRowCount = finalized.rowCount;
        }
        jobDoc.status = 'completed';
        jobDoc.completedAt = new Date();
        await jobDoc.save();
        return toSummary(jobDoc.toObject() as ExportJobDoc);
      }

      const rows: Record<string, string>[] = [];
      for (const voter of voters) {
        const phoneValue = includePhone ? await getPhoneNumbersForCnic(String(voter.cnic ?? ''), phoneCache) : '';
        rows.push(buildRow(voter, job.fields, phoneValue));
      }

      const newSize = await appendCsvRows(csvPath, job.fields, rows);
      if (newSize > MAX_EXPORT_FILE_BYTES) {
        jobDoc.status = 'size_exceeded';
        jobDoc.error = `Export exceeded the ${MAX_EXPORT_FILE_MB} MB limit (${Math.round(newSize / 1024 / 1024)} MB). Reduce block codes or fields.`;
        jobDoc.combinedFileSizeBytes = newSize;
        await jobDoc.save();
        return toSummary(jobDoc.toObject() as ExportJobDoc);
      }

      const lastVoter = voters[voters.length - 1];
      jobDoc.combinedLastVoterId = String(lastVoter._id);
      jobDoc.combinedRowCount = (jobDoc.combinedRowCount ?? 0) + voters.length;
      jobDoc.processedVoters = (jobDoc.processedVoters ?? 0) + voters.length;
      jobDoc.combinedFileSizeBytes = newSize;
      await jobDoc.save();
      return toSummary(jobDoc.toObject() as ExportJobDoc);
    }

    let blockIndex = jobDoc.currentBlockIndex ?? 0;
    while (blockIndex < jobDoc.blockCodeProgress.length) {
      const block = jobDoc.blockCodeProgress[blockIndex];
      if (block.status === 'completed' || block.status === 'size_exceeded') {
        blockIndex += 1;
        jobDoc.currentBlockIndex = blockIndex;
        continue;
      }

      if (block.status === 'pending') {
        block.status = 'running';
        jobDoc.blockCodeProgress[blockIndex] = block;
        await jobDoc.save();
      }

      const csvPath = path.join(jobDir, `${block.blockCode}.csv`);
      block.filePath = csvPath;
      block.fileName = `${block.blockCode}.csv`;

      const voters = await fetchVoterBatch(block, jobDoc.toObject() as ExportJobDoc, EXPORT_BATCH_SIZE);

      if (!voters.length) {
        const finalized = await finalizeBlockFile(jobDoc.toObject() as ExportJobDoc, block, jobDir);
        if (finalized) {
          block.fileName = finalized.fileName;
          block.filePath = finalized.filePath;
          block.fileSizeBytes = finalized.sizeBytes;
          block.rowCount = finalized.rowCount;
          block.status = finalized.sizeBytes > MAX_EXPORT_FILE_BYTES ? 'size_exceeded' : 'completed';
          if (block.status === 'size_exceeded') {
            block.error = `File for block ${block.blockCode} exceeded ${MAX_EXPORT_FILE_MB} MB`;
            jobDoc.error = `One or more block files exceeded ${MAX_EXPORT_FILE_MB} MB. Last block: ${block.blockCode}`;
          }

          jobDoc.outputFiles = [
            ...(jobDoc.outputFiles ?? []).filter((file: OutputFileDoc) => file.blockCode !== block.blockCode),
            {
              blockCode: block.blockCode,
              halkaName: block.halkaName,
              fileName: finalized.fileName,
              filePath: finalized.filePath,
              sizeBytes: finalized.sizeBytes,
              rowCount: finalized.rowCount,
            },
          ];
        } else {
          block.status = 'completed';
        }

        jobDoc.blockCodeProgress[blockIndex] = block;
        jobDoc.currentBlockIndex = blockIndex + 1;
        await jobDoc.save();

        if (blockIndex + 1 >= jobDoc.blockCodeProgress.length) {
          const hasSizeError = jobDoc.blockCodeProgress.some((item: BlockCodeProgressDoc) => item.status === 'size_exceeded');
          jobDoc.status = hasSizeError ? 'size_exceeded' : 'completed';
          jobDoc.completedAt = new Date();
          await jobDoc.save();
        }

        return toSummary(jobDoc.toObject() as ExportJobDoc);
      }

      const rows: Record<string, string>[] = [];
      for (const voter of voters) {
        const phoneValue = includePhone ? await getPhoneNumbersForCnic(String(voter.cnic ?? ''), phoneCache) : '';
        rows.push(buildRow(voter, job.fields, phoneValue));
      }

      const newSize = await appendCsvRows(csvPath, job.fields, rows);
      if (newSize > MAX_EXPORT_FILE_BYTES) {
        block.status = 'size_exceeded';
        block.error = `File for block ${block.blockCode} exceeded ${MAX_EXPORT_FILE_MB} MB`;
        block.fileSizeBytes = newSize;
        block.processedVoters += voters.length;
        block.rowCount += voters.length;
        jobDoc.blockCodeProgress[blockIndex] = block;
        jobDoc.processedVoters = (jobDoc.processedVoters ?? 0) + voters.length;
        jobDoc.currentBlockIndex = blockIndex + 1;
        jobDoc.error = `One or more block files exceeded ${MAX_EXPORT_FILE_MB} MB. Last block: ${block.blockCode}`;
        await jobDoc.save();
        return toSummary(jobDoc.toObject() as ExportJobDoc);
      }

      const lastVoter = voters[voters.length - 1];
      block.lastVoterId = String(lastVoter._id);
      block.processedVoters += voters.length;
      block.rowCount += voters.length;
      block.fileSizeBytes = newSize;
      jobDoc.processedVoters = (jobDoc.processedVoters ?? 0) + voters.length;
      jobDoc.blockCodeProgress[blockIndex] = block;
      await jobDoc.save();
      return toSummary(jobDoc.toObject() as ExportJobDoc);
    }

    const hasSizeError = jobDoc.blockCodeProgress.some((item: BlockCodeProgressDoc) => item.status === 'size_exceeded');
    jobDoc.status = hasSizeError ? 'size_exceeded' : 'completed';
    jobDoc.completedAt = new Date();
    await jobDoc.save();
    return toSummary(jobDoc.toObject() as ExportJobDoc);
  } catch (error) {
    jobDoc.status = 'failed';
    jobDoc.error = error instanceof Error ? error.message : 'Export failed';
    await jobDoc.save();
    return toSummary(jobDoc.toObject() as ExportJobDoc);
  }
}

export async function resumeExportJob(jobId: string): Promise<ExportJobSummary | null> {
  await connectDB();
  if (!ObjectId.isValid(jobId)) {
    return null;
  }

  const job = await ExportJob.findById(jobId);
  if (!job) {
    return null;
  }

  if (['completed', 'cancelled'].includes(job.status)) {
    return toSummary(job.toObject() as ExportJobDoc);
  }

  job.status = 'pending';
  job.error = null;
  await job.save();
  return toSummary(job.toObject() as ExportJobDoc);
}

export async function getExportDownloadPath(
  jobId: string,
  fileName: string
): Promise<{ filePath: string; downloadName: string } | null> {
  await connectDB();
  if (!ObjectId.isValid(jobId)) {
    return null;
  }

  const raw = await ExportJob.findById(jobId).lean();
  if (!raw) {
    return null;
  }

  const job = asExportJobDoc(raw);

  const outputFile = (job.outputFiles ?? []).find((file: OutputFileDoc) => file.fileName === fileName);
  if (!outputFile?.filePath) {
    if (job.combinedFileName === fileName && job.combinedFilePath) {
      return { filePath: job.combinedFilePath, downloadName: fileName };
    }
    return null;
  }

  const resolved = path.resolve(outputFile.filePath);
  const jobDir = path.resolve(getJobDir(jobId));
  if (!resolved.startsWith(jobDir)) {
    return null;
  }

  return { filePath: resolved, downloadName: outputFile.fileName };
}

export function formatExportJob(job: ExportJobSummary) {
  return job;
}

export async function runExportUntilComplete(
  jobId: string,
  onProgress?: (job: ExportJobSummary) => void
): Promise<ExportJobSummary | null> {
  const terminalStatuses = new Set(['completed', 'failed', 'cancelled', 'size_exceeded']);

  while (true) {
    const job = await processExportBatch(jobId);
    if (!job) {
      return null;
    }

    onProgress?.(job);

    if (terminalStatuses.has(job.status)) {
      return job;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

export async function copyExportFilesToDir(
  jobId: string,
  destinationDir: string
): Promise<string[]> {
  await connectDB();
  const raw = await ExportJob.findById(jobId).lean();
  if (!raw) {
    throw new Error(`Export job not found: ${jobId}`);
  }

  const job = asExportJobDoc(raw);
  await fs.mkdir(destinationDir, { recursive: true });

  const copied: string[] = [];
  for (const file of job.outputFiles ?? []) {
    if (!file.filePath) {
      continue;
    }
    const targetPath = path.join(destinationDir, file.fileName);
    await fs.copyFile(file.filePath, targetPath);
    copied.push(targetPath);
  }

  return copied;
}
