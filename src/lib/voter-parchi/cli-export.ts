import fs from 'fs/promises';
import path from 'path';
import { ObjectId, type Db } from 'mongodb';
import { PDFDocument } from 'pdf-lib';
import { connectNativeMongoClient } from '@/lib/mongo-client';
import { findConstituencyByHalka } from '@/lib/constituency';
import { sortBlockCodes } from '@/lib/blockcode-hub';
import {
  ensureDefaultDesign,
  getDesignById,
  buildParchiFileName,
} from '@/lib/voter-parchi/job-service';
import { buildParchiPdfBuffer, countPdfPages } from '@/lib/voter-parchi/pdf-generator';
import {
  PARCHI_BATCH_SIZE,
  type VoterParchiDesign,
  type VoterParchiJob,
} from '@/lib/voter-parchi/types';
import {
  enrichVotersWithPolling,
  parseObjectIdCursor,
  voterFilterQuery,
} from '@/lib/voter-parchi/voter-data';
import { upsertLatestParchiPdf } from '@/lib/voter-parchi/latest-store';

export type ParchiCliExportMode = 'combined' | 'per-block';
export type ParchiCliExportStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface ParchiCliPartFile {
  fileName: string;
  localPath: string;
  voterCount: number;
  pageCount: number;
  sizeBytes: number;
  blockCode?: string | null;
}

export interface ParchiCliFinalFile {
  fileName: string;
  localPath: string;
  voterCount: number;
  pageCount: number;
  sizeBytes: number;
  blockCode?: string | null;
}

export interface ParchiCliExportJob {
  _id: string;
  halkaName: string;
  designId: string;
  designName: string;
  mode: ParchiCliExportMode;
  blockCodes: string[];
  genderFilter: 'both' | 'male' | 'female';
  status: ParchiCliExportStatus;
  totalVoters: number;
  processedVoters: number;
  currentBlockIndex: number;
  currentBlockCode: string | null;
  lastVoterId: string | null;
  partFiles: ParchiCliPartFile[];
  finalFiles: ParchiCliFinalFile[];
  batchSize: number;
  outputDir: string;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
  pausedAt: Date | null;
  completedAt: Date | null;
  progressPercent: number;
}

const CLI_JOBS_COLLECTION = 'voter_parchi_cli_jobs';
const VOTER_PROJECTION = {
  _id: 1,
  cnic: 1,
  name: 1,
  fatherName: 1,
  age: 1,
  address: 1,
  previousAddress: 1,
  blockCode: 1,
  silsilaNo: 1,
  gharanaNo: 1,
  gender: 1,
  profession: 1,
  religion: 1,
  imageUrl: 1,
  rowY: 1,
  rowHeight: 1,
  reproduction: 1,
  halkaName: 1,
};

function normalizeHalka(halkaName: string): string {
  return halkaName.replace(/\s+/g, '').toUpperCase();
}

function getCliJobsRoot(): string {
  return path.join(process.cwd(), 'data', 'voter-parchi-cli');
}

function getJobWorkDir(jobId: string): string {
  return path.join(getCliJobsRoot(), jobId);
}

function progressPercent(processed: number, total: number, status: ParchiCliExportStatus): number {
  if (total <= 0) return status === 'completed' ? 100 : 0;
  return Math.min(100, Math.round((processed / total) * 100));
}

function toJob(doc: Record<string, unknown>): ParchiCliExportJob {
  const processedVoters = Number(doc.processedVoters) || 0;
  const totalVoters = Number(doc.totalVoters) || 0;
  const status = (doc.status as ParchiCliExportStatus) ?? 'pending';
  return {
    _id: String(doc._id),
    halkaName: String(doc.halkaName ?? ''),
    designId: String(doc.designId ?? ''),
    designName: String(doc.designName ?? ''),
    mode: (doc.mode as ParchiCliExportMode) ?? 'combined',
    blockCodes: Array.isArray(doc.blockCodes) ? doc.blockCodes.map(String) : [],
    genderFilter: (doc.genderFilter as ParchiCliExportJob['genderFilter']) ?? 'both',
    status,
    totalVoters,
    processedVoters,
    currentBlockIndex: Number(doc.currentBlockIndex) || 0,
    currentBlockCode: doc.currentBlockCode ? String(doc.currentBlockCode) : null,
    lastVoterId: doc.lastVoterId ? String(doc.lastVoterId) : null,
    partFiles: Array.isArray(doc.partFiles) ? (doc.partFiles as ParchiCliPartFile[]) : [],
    finalFiles: Array.isArray(doc.finalFiles) ? (doc.finalFiles as ParchiCliFinalFile[]) : [],
    batchSize: Number(doc.batchSize) || PARCHI_BATCH_SIZE,
    outputDir: String(doc.outputDir ?? ''),
    error: doc.error ? String(doc.error) : null,
    createdAt: doc.createdAt ? new Date(doc.createdAt as string | Date) : new Date(),
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt as string | Date) : new Date(),
    pausedAt: doc.pausedAt ? new Date(doc.pausedAt as string | Date) : null,
    completedAt: doc.completedAt ? new Date(doc.completedAt as string | Date) : null,
    progressPercent: progressPercent(processedVoters, totalVoters, status),
  };
}

async function getJob(jobId: string, db?: Db): Promise<ParchiCliExportJob | null> {
  const ownClient = db ? null : await connectNativeMongoClient();
  try {
    const database = db ?? ownClient!.db('vdp');
    const doc = await database.collection(CLI_JOBS_COLLECTION).findOne({ _id: new ObjectId(jobId) });
    return doc ? toJob(doc as Record<string, unknown>) : null;
  } finally {
    if (ownClient) await ownClient.close();
  }
}

async function updateJob(
  db: Db,
  jobId: string,
  fields: Record<string, unknown>
): Promise<ParchiCliExportJob | null> {
  await db.collection(CLI_JOBS_COLLECTION).updateOne(
    { _id: new ObjectId(jobId) },
    { $set: { ...fields, updatedAt: new Date() } }
  );
  return getJob(jobId, db);
}

export async function resolveConstituencyBlockCodes(
  halkaName: string,
  blockCodes: string[],
  allBlockCodes: boolean
): Promise<string[]> {
  const normalized = normalizeHalka(halkaName);
  if (!allBlockCodes) {
    return sortBlockCodes(Array.from(new Set(blockCodes.map((c) => String(c).trim()).filter(Boolean))));
  }

  const constituency = await findConstituencyByHalka(normalized);
  const fromConstituency = Array.isArray(constituency?.blockCodes)
    ? constituency!.blockCodes.map(String)
    : [];

  if (fromConstituency.length > 0) {
    return sortBlockCodes(fromConstituency);
  }

  const client = await connectNativeMongoClient();
  try {
    const db = client.db('vdp');
    const distinct = await db.collection('voters').distinct('blockCode', { halkaName: normalized });
    return sortBlockCodes(distinct.map(String).filter(Boolean));
  } finally {
    await client.close();
  }
}

async function mergePdfFiles(filePaths: string[]): Promise<Buffer> {
  const merged = await PDFDocument.create();
  for (const filePath of filePaths) {
    const bytes = await fs.readFile(filePath);
    const source = await PDFDocument.load(bytes);
    const pages = await merged.copyPages(source, source.getPageIndices());
    for (const page of pages) {
      merged.addPage(page);
    }
  }
  return Buffer.from(await merged.save());
}

function formatDatePart(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(-2);
  return `${dd}${mm}${yy}`;
}

async function writePartPdf(
  job: ParchiCliExportJob,
  design: VoterParchiDesign,
  voters: Awaited<ReturnType<typeof enrichVotersWithPolling>>,
  blockCode: string | null
): Promise<ParchiCliPartFile> {
  const buffer = await buildParchiPdfBuffer(job.halkaName, design, voters);
  const partIndex = job.partFiles.length;
  const fileName = buildParchiFileName({
    halkaName: job.halkaName,
    blockCodes: blockCode ? [blockCode] : job.blockCodes,
    selectAllBlockCodes: job.mode === 'combined',
    partIndex,
    createdAt: job.createdAt,
  }).replace(/\.pdf$/i, `-part${String(partIndex + 1).padStart(3, '0')}.pdf`);

  const workDir = getJobWorkDir(job._id);
  await fs.mkdir(workDir, { recursive: true });
  const localPath = path.join(workDir, fileName);
  await fs.writeFile(localPath, buffer);

  return {
    fileName,
    localPath,
    voterCount: voters.length,
    pageCount: countPdfPages(voters.length, design.parchiPerPage || 3),
    sizeBytes: buffer.length,
    blockCode,
  };
}

async function finalizeMergedPdf(
  job: ParchiCliExportJob,
  parts: ParchiCliPartFile[],
  blockCode: string | null
): Promise<ParchiCliFinalFile> {
  if (parts.length === 0) {
    throw new Error('No PDF parts to merge');
  }

  const workDir = getJobWorkDir(job._id);
  await fs.mkdir(workDir, { recursive: true });

  const datePart = formatDatePart(job.createdAt);
  const halka = normalizeHalka(job.halkaName);
  const fileName =
    job.mode === 'combined'
      ? `${halka}-ALL-${datePart}.pdf`
      : `${halka}-${String(blockCode ?? 'BLOCK').replace(/\D/g, '') || 'BLOCK'}-${datePart}.pdf`;

  const destinationDir = job.outputDir ? path.resolve(job.outputDir) : workDir;
  await fs.mkdir(destinationDir, { recursive: true });
  const localPath = path.join(destinationDir, fileName);

  let buffer: Buffer;
  let pageCount = parts.reduce((sum, part) => sum + part.pageCount, 0);
  let voterCount = parts.reduce((sum, part) => sum + part.voterCount, 0);

  if (parts.length === 1) {
    buffer = await fs.readFile(parts[0].localPath);
    pageCount = parts[0].pageCount;
    voterCount = parts[0].voterCount;
  } else {
    buffer = await mergePdfFiles(parts.map((part) => part.localPath));
  }

  await fs.writeFile(localPath, buffer);

  if (blockCode) {
    try {
      await upsertLatestParchiPdf({
        halkaName: job.halkaName,
        blockCode,
        source: 'cli',
        jobId: job._id,
        designId: job.designId,
        genderFilter: job.genderFilter,
        sourcePaths: [localPath],
        voterCount,
        pageCount,
      });
    } catch (error) {
      console.warn(
        'Failed to update latest voter parchi catalog from CLI:',
        error instanceof Error ? error.message : error
      );
    }
  }

  return {
    fileName,
    localPath,
    voterCount,
    pageCount,
    sizeBytes: buffer.length,
    blockCode,
  };
}

export async function createParchiCliExportJob(input: {
  halkaName: string;
  mode: ParchiCliExportMode;
  blockCodes?: string[];
  allBlockCodes?: boolean;
  genderFilter?: 'both' | 'male' | 'female';
  designId?: string;
  batchSize?: number;
  outputDir?: string;
}): Promise<ParchiCliExportJob> {
  const normalized = normalizeHalka(input.halkaName);
  const blockCodes = await resolveConstituencyBlockCodes(
    normalized,
    input.blockCodes ?? [],
    Boolean(input.allBlockCodes)
  );

  if (blockCodes.length === 0) {
    throw new Error('No block codes found. Pass --block-codes or --all-blockcodes.');
  }

  let design =
    input.designId != null && input.designId.trim()
      ? await getDesignById(input.designId.trim())
      : null;
  if (!design) {
    design = await ensureDefaultDesign(normalized, 'cli@export-parchi');
  }

  const client = await connectNativeMongoClient();
  try {
    const db = client.db('vdp');
    const countFilter = voterFilterQuery(
      normalized,
      blockCodes,
      false,
      input.genderFilter ?? 'both'
    );
    const totalVoters = await db.collection('voters').countDocuments(countFilter);

    if (totalVoters === 0) {
      throw new Error(`No voters found for ${normalized}.`);
    }

    const outputDir = input.outputDir ? path.resolve(input.outputDir) : '';
    const doc = {
      halkaName: normalized,
      designId: design._id,
      designName: design.name,
      mode: input.mode,
      blockCodes,
      genderFilter: input.genderFilter ?? 'both',
      status: 'pending' as const,
      totalVoters,
      processedVoters: 0,
      currentBlockIndex: 0,
      currentBlockCode: input.mode === 'per-block' ? blockCodes[0] : null,
      lastVoterId: null,
      partFiles: [] as ParchiCliPartFile[],
      finalFiles: [] as ParchiCliFinalFile[],
      batchSize: Math.max(5, Math.min(120, input.batchSize ?? PARCHI_BATCH_SIZE)),
      outputDir,
      error: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      pausedAt: null,
      completedAt: null,
    };

    const result = await db.collection(CLI_JOBS_COLLECTION).insertOne(doc);
    return toJob({ ...doc, _id: result.insertedId } as Record<string, unknown>);
  } finally {
    await client.close();
  }
}

export async function listParchiCliExportJobs(limit = 20): Promise<ParchiCliExportJob[]> {
  const client = await connectNativeMongoClient();
  try {
    const db = client.db('vdp');
    const docs = await db
      .collection(CLI_JOBS_COLLECTION)
      .find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
    return docs.map((doc) => toJob(doc as Record<string, unknown>));
  } finally {
    await client.close();
  }
}

export async function resumeParchiCliExportJob(jobId: string): Promise<ParchiCliExportJob | null> {
  if (!ObjectId.isValid(jobId)) return null;
  const client = await connectNativeMongoClient();
  try {
    const db = client.db('vdp');
    const job = await getJob(jobId, db);
    if (!job) return null;
    if (job.status === 'completed' || job.status === 'cancelled') {
      return job;
    }
    return updateJob(db, jobId, {
      status: 'running',
      error: null,
      pausedAt: null,
    });
  } finally {
    await client.close();
  }
}

export async function pauseParchiCliExportJob(jobId: string): Promise<ParchiCliExportJob | null> {
  if (!ObjectId.isValid(jobId)) return null;
  const client = await connectNativeMongoClient();
  try {
    const db = client.db('vdp');
    const job = await getJob(jobId, db);
    if (!job) return null;
    if (['completed', 'failed', 'cancelled'].includes(job.status)) {
      return job;
    }
    return updateJob(db, jobId, {
      status: 'paused',
      pausedAt: new Date(),
      error: null,
    });
  } finally {
    await client.close();
  }
}

async function processCombinedBatch(
  db: Db,
  job: ParchiCliExportJob,
  design: VoterParchiDesign
): Promise<ParchiCliExportJob | null> {
  const filter = voterFilterQuery(job.halkaName, job.blockCodes, false, job.genderFilter);
  const cursorId = parseObjectIdCursor(job.lastVoterId);
  if (cursorId) {
    filter._id = { $gt: cursorId };
  }

  const voterDocs = await db
    .collection('voters')
    .find(filter)
    .sort({ _id: 1 })
    .limit(job.batchSize)
    .project(VOTER_PROJECTION)
    .toArray();

  if (voterDocs.length === 0) {
    if (job.partFiles.length === 0) {
      return updateJob(db, job._id, {
        status: 'completed',
        completedAt: new Date(),
        error: null,
        currentBlockCode: null,
      });
    }
    const finalFile = await finalizeMergedPdf(job, job.partFiles, null);
    return updateJob(db, job._id, {
      status: 'completed',
      completedAt: new Date(),
      finalFiles: [...job.finalFiles, finalFile],
      partFiles: [],
      error: null,
      currentBlockCode: null,
    });
  }

  const voters = await enrichVotersWithPolling(db, job.halkaName, voterDocs as Record<string, unknown>[]);
  const part = await writePartPdf(job, design, voters, null);
  const processedVoters = job.processedVoters + voters.length;
  const lastVoterId = String(voterDocs[voterDocs.length - 1]._id);
  const partFiles = [...job.partFiles, part];
  const isComplete = processedVoters >= job.totalVoters;

  if (isComplete) {
    const finalFile = await finalizeMergedPdf({ ...job, partFiles }, partFiles, null);
    return updateJob(db, job._id, {
      processedVoters,
      lastVoterId,
      partFiles: [],
      finalFiles: [...job.finalFiles, finalFile],
      status: 'completed',
      completedAt: new Date(),
      error: null,
    });
  }

  return updateJob(db, job._id, {
    processedVoters,
    lastVoterId,
    partFiles,
    status: 'running',
    error: null,
  });
}

async function processPerBlockBatch(
  db: Db,
  job: ParchiCliExportJob,
  design: VoterParchiDesign
): Promise<ParchiCliExportJob | null> {
  if (job.currentBlockIndex >= job.blockCodes.length) {
    return updateJob(db, job._id, {
      status: 'completed',
      completedAt: new Date(),
      currentBlockCode: null,
      error: null,
    });
  }

  const blockCode = job.blockCodes[job.currentBlockIndex];
  const filter = voterFilterQuery(job.halkaName, [blockCode], false, job.genderFilter);
  const cursorId = parseObjectIdCursor(job.lastVoterId);
  if (cursorId) {
    filter._id = { $gt: cursorId };
  }

  const voterDocs = await db
    .collection('voters')
    .find(filter)
    .sort({ _id: 1 })
    .limit(job.batchSize)
    .project(VOTER_PROJECTION)
    .toArray();

  if (voterDocs.length === 0) {
    const finalFiles = [...job.finalFiles];
    if (job.partFiles.length > 0) {
      finalFiles.push(await finalizeMergedPdf(job, job.partFiles, blockCode));
    }

    const nextIndex = job.currentBlockIndex + 1;
    if (nextIndex >= job.blockCodes.length) {
      return updateJob(db, job._id, {
        status: 'completed',
        completedAt: new Date(),
        currentBlockIndex: nextIndex,
        currentBlockCode: null,
        lastVoterId: null,
        partFiles: [],
        finalFiles,
        error: null,
      });
    }

    return updateJob(db, job._id, {
      currentBlockIndex: nextIndex,
      currentBlockCode: job.blockCodes[nextIndex],
      lastVoterId: null,
      partFiles: [],
      finalFiles,
      status: 'running',
      error: null,
    });
  }

  const voters = await enrichVotersWithPolling(db, job.halkaName, voterDocs as Record<string, unknown>[]);
  const part = await writePartPdf(job, design, voters, blockCode);
  const processedVoters = job.processedVoters + voters.length;
  const lastVoterId = String(voterDocs[voterDocs.length - 1]._id);
  const partFiles = [...job.partFiles, part];

  // Peek whether more voters remain in this block.
  const moreInBlock = await db.collection('voters').countDocuments({
    ...voterFilterQuery(job.halkaName, [blockCode], false, job.genderFilter),
    _id: { $gt: voterDocs[voterDocs.length - 1]._id },
  });

  if (moreInBlock === 0) {
    const finalFile = await finalizeMergedPdf({ ...job, partFiles }, partFiles, blockCode);
    const nextIndex = job.currentBlockIndex + 1;
    if (nextIndex >= job.blockCodes.length) {
      return updateJob(db, job._id, {
        processedVoters,
        lastVoterId: null,
        partFiles: [],
        finalFiles: [...job.finalFiles, finalFile],
        currentBlockIndex: nextIndex,
        currentBlockCode: null,
        status: 'completed',
        completedAt: new Date(),
        error: null,
      });
    }

    return updateJob(db, job._id, {
      processedVoters,
      lastVoterId: null,
      partFiles: [],
      finalFiles: [...job.finalFiles, finalFile],
      currentBlockIndex: nextIndex,
      currentBlockCode: job.blockCodes[nextIndex],
      status: 'running',
      error: null,
    });
  }

  return updateJob(db, job._id, {
    processedVoters,
    lastVoterId,
    partFiles,
    currentBlockCode: blockCode,
    status: 'running',
    error: null,
  });
}

export async function processParchiCliExportBatch(jobId: string): Promise<ParchiCliExportJob | null> {
  const client = await connectNativeMongoClient();
  const db = client.db('vdp');

  try {
    let job = await getJob(jobId, db);
    if (!job) return null;
    if (['completed', 'failed', 'cancelled', 'paused'].includes(job.status)) {
      return job;
    }

    if (job.status === 'pending') {
      job = (await updateJob(db, jobId, { status: 'running', error: null })) ?? job;
    }

    const design = await getDesignById(job.designId, db);
    if (!design) {
      return updateJob(db, jobId, { status: 'failed', error: 'Design not found' });
    }

    if (job.mode === 'combined') {
      return await processCombinedBatch(db, job, design);
    }
    return await processPerBlockBatch(db, job, design);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Parchi CLI export failed';
    console.error('Parchi CLI batch failed:', error);
    try {
      return await updateJob(db, jobId, { status: 'failed', error: message });
    } catch {
      return null;
    }
  } finally {
    await client.close();
  }
}

export async function runParchiCliExportUntilComplete(
  jobId: string,
  options?: {
    onProgress?: (job: ParchiCliExportJob) => void;
    shouldPause?: () => boolean;
  }
): Promise<ParchiCliExportJob | null> {
  const terminal = new Set(['completed', 'failed', 'cancelled', 'paused']);

  while (true) {
    if (options?.shouldPause?.()) {
      return pauseParchiCliExportJob(jobId);
    }

    const job = await processParchiCliExportBatch(jobId);
    if (!job) return null;
    options?.onProgress?.(job);

    if (terminal.has(job.status)) {
      return job;
    }

    if (options?.shouldPause?.()) {
      return pauseParchiCliExportJob(jobId);
    }
  }
}

/** Re-export for typing convenience against UI job shape when needed. */
export type { VoterParchiJob };
