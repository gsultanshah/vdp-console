import fs from 'fs/promises';
import path from 'path';
import { ObjectId, type Db, type Document } from 'mongodb';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import connectDB from '@/lib/mongodb';
import ExportJob, { type BlockCodeProgressDoc, type ExportJobDoc, type OutputFileDoc } from '@/models/ExportJob';
import Constituency from '@/models/Constituency';
import {
  DEFAULT_EXPORT_FIELD_IDS,
  EXPORT_BATCH_SIZE,
  MAX_EXPORT_FILE_BYTES,
  MAX_EXPORT_FILE_MB,
  UTF8_BOM,
  exportFieldLabel,
  normalizeExportFields,
  type ExportFormat,
  type ExportMode,
  type ExportTableColumnMeta,
} from '@/lib/export-fields';
import { getConstituencyTableColumnSettings } from '@/lib/constituency';
import {
  buildExportFieldsWithTableColumns,
  exportLabelForField,
  getCellValueForExport,
  isCellFieldId,
  mergeTableColumnDefinitions,
} from '@/lib/voter-cells';
import type { ConstituencyTableColumnSettings } from '@/lib/table-column-settings';
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
  includeTableColumns?: boolean;
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
  includeTableColumns: boolean;
  tableColumns: ExportTableColumnMeta[];
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

function sanitizeFileToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '_');
}

export function blockExportBaseName(halkaName: string, blockCode: string): string {
  return `${sanitizeFileToken(halkaName)}-${blockCode}`;
}

export function combinedExportBaseName(halkaNames: string[]): string {
  const tokens = halkaNames.map(sanitizeFileToken).filter(Boolean);
  return tokens.length === 1 ? `${tokens[0]}-export` : `${tokens.join('_')}-export`;
}

async function getVotersDb(): Promise<Db> {
  const mongoose = await connectDB();
  if (!mongoose.connection.db) {
    throw new Error('MongoDB connection not ready');
  }
  return mongoose.connection.db;
}

async function ensureJobDir(jobId: string): Promise<string> {
  const dir = getJobDir(jobId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

function toSummary(job: ExportJobDoc): ExportJobSummary {
  const progressPercent =
    job.totalVoters > 0 ? Math.min(100, Math.round((job.processedVoters / job.totalVoters) * 100)) : 0;
  const currentBlock =
    job.mode === 'default_per_blockcode' ? job.blockCodeProgress[job.currentBlockIndex] : null;

  const resumable = ['pending', 'running', 'failed'].includes(job.status);

  return {
    _id: String(job._id),
    status: job.status,
    createdBy: job.createdBy,
    createdByName: job.createdByName,
    halkaNames: job.halkaNames,
    blockCodes: job.blockCodes,
    fields: job.fields,
    includeTableColumns: job.includeTableColumns ?? false,
    tableColumns: job.tableColumns ?? [],
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
  const db = await getVotersDb();
  const counts = new Map<string, number>();

  for (const entry of blockEntries) {
    counts.set(`${entry.halkaName}:${entry.blockCode}`, 0);
  }

  if (!blockEntries.length) {
    return counts;
  }

  const results = await db
    .collection('voters')
    .aggregate<{ _id: { halkaName: string; blockCode: string }; count: number }>([
      {
        $match: {
          $or: blockEntries.map((entry) => ({
            blockCode: entry.blockCode,
            halkaName: entry.halkaName,
          })),
        },
      },
      {
        $group: {
          _id: { halkaName: '$halkaName', blockCode: '$blockCode' },
          count: { $sum: 1 },
        },
      },
    ])
    .toArray();

  for (const row of results) {
    counts.set(`${row._id.halkaName}:${row._id.blockCode}`, row.count);
  }

  return counts;
}

async function loadTableColumnsForHalkas(
  halkaNames: string[]
): Promise<{
  tableColumns: ExportTableColumnMeta[];
  settingsByHalka: Map<string, ConstituencyTableColumnSettings | null>;
}> {
  const settingsByHalka = new Map<string, ConstituencyTableColumnSettings | null>();
  const settingsList: Array<ConstituencyTableColumnSettings | null> = [];

  for (const halkaName of halkaNames) {
    const settings = await getConstituencyTableColumnSettings(halkaName);
    settingsByHalka.set(halkaName, settings);
    settingsList.push(settings);
  }

  const merged = mergeTableColumnDefinitions(settingsList);
  const tableColumns: ExportTableColumnMeta[] = merged.map((column) => ({
    id: column.id,
    label: column.label,
    index: column.index,
  }));

  return { tableColumns, settingsByHalka };
}

export async function createExportJob(input: CreateExportJobInput): Promise<ExportJobSummary> {
  const mode = input.mode ?? 'custom';
  const format = input.format ?? 'csv';
  const includeTableColumns = Boolean(input.includeTableColumns);

  const { halkaNames, blockCodes, blockEntries } = await resolveBlockCodes({
    ...input,
    mode,
  });

  let tableColumns: ExportTableColumnMeta[] = [];
  if (includeTableColumns) {
    const loaded = await loadTableColumnsForHalkas(halkaNames);
    tableColumns = loaded.tableColumns;
    if (!tableColumns.length) {
      throw new Error(
        'No table column settings found for the selected constituency. Configure columns in Constituency → Table columns first.'
      );
    }
  }

  const tableColumnDefs = tableColumns.map((column) => ({
    id: column.id,
    label: column.label,
    minXRatio: 0,
    maxXRatio: 0,
    index: column.index,
  }));

  const fields = includeTableColumns
    ? buildExportFieldsWithTableColumns(tableColumnDefs)
    : mode === 'default_per_blockcode'
      ? [...DEFAULT_EXPORT_FIELD_IDS]
      : normalizeExportFields(input.fields);

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
    includeTableColumns,
    tableColumns,
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

async function prefetchPhoneNumbersForVoters(
  voters: Document[],
  cache: Map<string, string>
): Promise<void> {
  if (!isPhoneDataConfigured()) {
    return;
  }

  const uncached = new Set<string>();
  for (const voter of voters) {
    const normalized = String(voter.cnic ?? '').replace(/\D/g, '');
    if (normalized && !cache.has(normalized)) {
      uncached.add(normalized);
    }
  }

  await Promise.all(
    Array.from(uncached).map(async (normalized) => {
      try {
        const records = await searchPhoneDataByCnic(normalized);
        const phones = records
          .map((record) => formatPhoneDisplay(record.phone))
          .filter(Boolean)
          .join('; ');
        cache.set(normalized, phones);
      } catch {
        cache.set(normalized, '');
      }
    })
  );
}

function voterFieldValue(
  voter: Document,
  fieldId: string,
  phoneValue: string,
  tableColumns: ExportTableColumnMeta[],
  columnSettingsByHalka: Map<string, ConstituencyTableColumnSettings | null>
): string {
  if (isCellFieldId(fieldId)) {
    return getCellValueForExport(
      voter as Parameters<typeof getCellValueForExport>[0],
      fieldId,
      columnSettingsByHalka
    );
  }

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
  phoneValue: string,
  tableColumns: ExportTableColumnMeta[],
  columnSettingsByHalka: Map<string, ConstituencyTableColumnSettings | null>
): Record<string, string> {
  const row: Record<string, string> = {};
  for (const fieldId of fields) {
    const label =
      tableColumns.length && isCellFieldId(fieldId)
        ? exportLabelForField(
            fieldId,
            tableColumns.map((column) => ({
              id: column.id,
              label: column.label,
              minXRatio: 0,
              maxXRatio: 0,
              index: column.index,
            }))
          )
        : exportFieldLabel(fieldId);
    row[label] = voterFieldValue(voter, fieldId, phoneValue, tableColumns, columnSettingsByHalka);
  }
  return row;
}

async function writeCsvHeader(filePath: string, fields: string[], tableColumns: ExportTableColumnMeta[]): Promise<void> {
  const headers = fields
    .map((fieldId) =>
      tableColumns.length && isCellFieldId(fieldId)
        ? exportLabelForField(
            fieldId,
            tableColumns.map((column) => ({
              id: column.id,
              label: column.label,
              minXRatio: 0,
              maxXRatio: 0,
              index: column.index,
            }))
          )
        : exportFieldLabel(fieldId)
    )
    .join(',');
  await fs.writeFile(filePath, `${UTF8_BOM}${headers}\n`, 'utf8');
}

function stripUtf8Bom(content: string): string {
  return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
}

async function appendCsvRows(
  filePath: string,
  fields: string[],
  rows: Record<string, string>[],
  tableColumns: ExportTableColumnMeta[] = []
): Promise<number> {
  if (!rows.length) {
    return (await fs.stat(filePath).catch(() => null))?.size ?? 0;
  }

  const headers = fields.map((fieldId) =>
    tableColumns.length && isCellFieldId(fieldId)
      ? exportLabelForField(
          fieldId,
          tableColumns.map((column) => ({
            id: column.id,
            label: column.label,
            minXRatio: 0,
            maxXRatio: 0,
            index: column.index,
          }))
        )
      : exportFieldLabel(fieldId)
  );
  const exists = await fs
    .access(filePath)
    .then(() => true)
    .catch(() => false);

  const csvBody = Papa.unparse(rows, {
    columns: headers,
    header: !exists,
    quotes: true,
    quoteChar: '"',
    escapeChar: '"',
  });

  if (!exists) {
    await fs.writeFile(filePath, `${UTF8_BOM}${csvBody}`, 'utf8');
  } else {
    await fs.appendFile(filePath, `\n${csvBody}`, 'utf8');
  }

  const stats = await fs.stat(filePath);
  return stats.size;
}

async function convertCsvToXlsx(csvPath: string, xlsxPath: string, sheetName = 'Export'): Promise<void> {
  const rawContent = await fs.readFile(csvPath, 'utf8');
  const csvContent = stripUtf8Bom(rawContent);
  const parsed = Papa.parse<Record<string, string>>(csvContent, {
    header: true,
    skipEmptyLines: true,
  });

  const worksheet = XLSX.utils.json_to_sheet(parsed.data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  const buffer = XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
    compression: true,
  });
  await fs.writeFile(xlsxPath, buffer);
}

async function finalizeBlockFile(
  job: ExportJobDoc,
  block: BlockCodeProgressDoc,
  jobDir: string
): Promise<{ fileName: string; filePath: string; sizeBytes: number; rowCount: number } | null> {
  const baseName = blockExportBaseName(block.halkaName, block.blockCode);
  const csvPath = path.join(jobDir, `${baseName}.csv`);

  const csvExists = await fs
    .access(csvPath)
    .then(() => true)
    .catch(() => false);

  if (!csvExists) {
    await writeCsvHeader(csvPath, job.fields, job.tableColumns ?? []);
  }

  let finalPath = csvPath;
  let finalName = `${baseName}.csv`;

  if (job.format === 'xlsx') {
    finalPath = path.join(jobDir, `${baseName}.xlsx`);
    finalName = `${baseName}.xlsx`;
    await convertCsvToXlsx(csvPath, finalPath, block.blockCode);
    await fs.unlink(csvPath).catch(() => undefined);
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
): Promise<{ fileName: string; filePath: string; sizeBytes: number; rowCount: number }> {
  const baseName = combinedExportBaseName(job.halkaNames);
  const csvPath = job.combinedFilePath ?? path.join(jobDir, `${baseName}.csv`);
  const csvExists = await fs
    .access(csvPath)
    .then(() => true)
    .catch(() => false);

  if (!csvExists) {
    await writeCsvHeader(csvPath, job.fields, job.tableColumns ?? []);
  }

  let finalPath = csvPath;
  let finalName = `${baseName}.csv`;

  if (job.format === 'xlsx') {
    finalPath = path.join(jobDir, `${baseName}.xlsx`);
    finalName = `${baseName}.xlsx`;
    await convertCsvToXlsx(csvPath, finalPath, job.halkaNames.join('_'));
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
  const db = await getVotersDb();

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

  jobDoc.status = 'running';
  jobDoc.error = null;
  await jobDoc.save();

  const jobDir = await ensureJobDir(jobId);
  const phoneCache = new Map<string, string>();
  const includePhone = job.fields.includes('phone');
  const tableColumns = job.tableColumns ?? [];
  const columnSettingsByHalka = job.includeTableColumns
    ? (await loadTableColumnsForHalkas(job.halkaNames)).settingsByHalka
    : new Map<string, ConstituencyTableColumnSettings | null>();

  try {
    if (job.mode === 'custom') {
      const baseName = combinedExportBaseName(job.halkaNames);
      const csvPath = job.combinedFilePath ?? path.join(jobDir, `${baseName}.csv`);
      if (!job.combinedFilePath) {
        jobDoc.combinedFilePath = csvPath;
        jobDoc.combinedFileName = job.format === 'xlsx' ? `${baseName}.xlsx` : `${baseName}.csv`;
        await jobDoc.save();
      }

      const voters = await fetchVoterBatch(null, job, EXPORT_BATCH_SIZE);
      if (!voters.length) {
        const finalized = await finalizeCombinedFile(jobDoc.toObject() as ExportJobDoc, jobDir);
        jobDoc.outputFiles = [
          {
            blockCode: null,
            halkaName: job.halkaNames.length === 1 ? job.halkaNames[0] : null,
            fileName: finalized.fileName,
            filePath: finalized.filePath,
            sizeBytes: finalized.sizeBytes,
            rowCount: finalized.rowCount,
          },
        ];
        jobDoc.combinedFilePath = finalized.filePath;
        jobDoc.combinedFileName = finalized.fileName;
        jobDoc.combinedFileSizeBytes = finalized.sizeBytes;
        jobDoc.combinedRowCount = finalized.rowCount;
        jobDoc.status = 'completed';
        jobDoc.completedAt = new Date();
        await jobDoc.save();
        return toSummary(jobDoc.toObject() as ExportJobDoc);
      }

      if (includePhone) {
        await prefetchPhoneNumbersForVoters(voters, phoneCache);
      }

      const rows: Record<string, string>[] = [];
      for (const voter of voters) {
        const phoneValue = includePhone
          ? await getPhoneNumbersForCnic(String(voter.cnic ?? ''), phoneCache)
          : '';
        rows.push(buildRow(voter, job.fields, phoneValue, tableColumns, columnSettingsByHalka));
      }

      const newSize = await appendCsvRows(csvPath, job.fields, rows, tableColumns);
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

      const baseName = blockExportBaseName(block.halkaName, block.blockCode);
      const csvPath = path.join(jobDir, `${baseName}.csv`);
      block.filePath = csvPath;
      block.fileName = `${baseName}.csv`;

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

      if (includePhone) {
        await prefetchPhoneNumbersForVoters(voters, phoneCache);
      }

      const rows: Record<string, string>[] = [];
      for (const voter of voters) {
        const phoneValue = includePhone
          ? await getPhoneNumbersForCnic(String(voter.cnic ?? ''), phoneCache)
          : '';
        rows.push(buildRow(voter, job.fields, phoneValue, tableColumns, columnSettingsByHalka));
      }

      const newSize = await appendCsvRows(csvPath, job.fields, rows, tableColumns);
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
