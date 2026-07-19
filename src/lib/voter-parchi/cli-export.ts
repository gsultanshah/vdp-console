import fs from 'fs/promises';
import path from 'path';
import { createInterface } from 'readline';
import { ObjectId, type Db } from 'mongodb';
import { PDFDocument } from 'pdf-lib';
import { connectNativeMongoClient } from '@/lib/mongo-client';
import { findConstituencyByHalka } from '@/lib/constituency';
import { sortBlockCodes } from '@/lib/blockcode-hub';
import {
  ensureDefaultDesign,
  getDesignByCode,
  getDesignById,
  buildParchiFileName,
  createParchiJob,
  PollingStationRequiredError,
  processParchiBatch,
  getParchiLocalFilePath,
} from '@/lib/voter-parchi/job-service';
import { buildParchiPdfBuffer, countPdfPages } from '@/lib/voter-parchi/pdf-generator';
import {
  PARCHI_BATCH_SIZE,
  type VoterParchiDesign,
  type VoterParchiJob,
} from '@/lib/voter-parchi/types';
import {
  enrichVotersWithPolling,
  fetchParchiVoterDocsBatch,
  sortParchiVotersBySilsila,
  voterFilterQuery,
} from '@/lib/voter-parchi/voter-data';
import { getLatestParchi, upsertLatestParchiPdf } from '@/lib/voter-parchi/latest-store';

export type ParchiCliExportMode = 'combined' | 'per-block';

function askQuestion(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}
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
  designCode?: string | null;
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
  /** In-progress web console job used for per-block generation. */
  activeWebJobId: string | null;
  /** Voters already counted from fully finished blocks (excludes active web job). */
  completedBlocksVoters: number;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
  pausedAt: Date | null;
  completedAt: Date | null;
  progressPercent: number;
}

const CLI_JOBS_COLLECTION = 'voter_parchi_cli_jobs';

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
    designCode: doc.designCode ? String(doc.designCode) : null,
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
    activeWebJobId: doc.activeWebJobId ? String(doc.activeWebJobId) : null,
    completedBlocksVoters: Number(doc.completedBlocksVoters) || 0,
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
  return await getJob(jobId, db);
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

  const destinationDir = job.outputDir ? path.resolve(job.outputDir) : null;
  // Always persist on the server under the CLI job work directory (same machine as the web app).
  const serverPath = path.join(workDir, fileName);
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

  await fs.writeFile(serverPath, buffer);

  let localPath = serverPath;
  if (destinationDir) {
    await fs.mkdir(destinationDir, { recursive: true });
    const outPath = path.join(destinationDir, fileName);
    await fs.writeFile(outPath, buffer);
    localPath = outPath;
  }

  if (blockCode) {
    try {
      await upsertLatestParchiPdf({
        halkaName: job.halkaName,
        blockCode,
        source: 'cli',
        jobId: job._id,
        designId: job.designId,
        genderFilter: job.genderFilter,
        sourcePaths: [serverPath],
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
  designCode?: string;
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

  let design: VoterParchiDesign | null = null;
  if (input.designCode?.trim()) {
    design = await getDesignByCode(input.designCode.trim());
    if (!design) {
      throw new Error(`Design not found for code: ${input.designCode.trim()}`);
    }
  } else if (input.designId?.trim()) {
    design = await getDesignById(input.designId.trim());
    if (!design) {
      throw new Error(`Design not found for id: ${input.designId.trim()}`);
    }
  } else {
    design = await ensureDefaultDesign(normalized, 'cli@export-parchi');
  }

  if (design.halkaName !== normalized) {
    throw new Error(
      `Design ${design.designCode ?? design.name} belongs to ${design.halkaName}, not ${normalized}.`
    );
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
      designCode: design.designCode ?? null,
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
      activeWebJobId: null as string | null,
      completedBlocksVoters: 0,
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
    // Must await: finally closes the client and must not race the update.
    return await updateJob(db, jobId, {
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
    return await updateJob(db, jobId, {
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

  const voterDocs = await fetchParchiVoterDocsBatch(db, filter, {
    skip: job.processedVoters,
    limit: job.batchSize,
  });

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

  const voters = sortParchiVotersBySilsila(
    await enrichVotersWithPolling(db, job.halkaName, voterDocs, {
      skipRowCrops: false,
    })
  );
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

async function copyLatestToOptionalOut(
  job: ParchiCliExportJob,
  blockCode: string
): Promise<ParchiCliFinalFile | null> {
  const latest = await getLatestParchi(job.halkaName, blockCode);
  if (!latest?.localPath) {
    return null;
  }

  let localPath = latest.localPath;
  if (job.outputDir) {
    const destinationDir = path.resolve(job.outputDir);
    await fs.mkdir(destinationDir, { recursive: true });
    const outPath = path.join(destinationDir, latest.fileName);
    await fs.copyFile(latest.localPath, outPath);
    localPath = outPath;
  }

  return {
    fileName: latest.fileName,
    localPath,
    voterCount: latest.voterCount,
    pageCount: latest.pageCount,
    sizeBytes: latest.sizeBytes,
    blockCode,
  };
}

/**
 * Per-block CLI export uses the same web console job pipeline so PDFs are stored under
 * data/voter-parchi/{jobId}/ (+ Firebase) and voter_parchi_latest for the console UI.
 */
async function processPerBlockBatch(
  db: Db,
  job: ParchiCliExportJob,
  _design: VoterParchiDesign
): Promise<ParchiCliExportJob | null> {
  if (job.currentBlockIndex >= job.blockCodes.length) {
    return updateJob(db, job._id, {
      status: 'completed',
      completedAt: new Date(),
      currentBlockCode: null,
      activeWebJobId: null,
      error: null,
    });
  }

  const blockCode = job.blockCodes[job.currentBlockIndex];
  let webJobId = job.activeWebJobId;

  if (!webJobId) {
    let webJob: Awaited<ReturnType<typeof createParchiJob>>;
    try {
      webJob = await createParchiJob({
        halkaName: job.halkaName,
        designId: job.designId,
        blockCodes: [blockCode],
        selectAllBlockCodes: false,
        genderFilter: job.genderFilter,
        skipRowCrops: false,
        skipRemoteUpload: true,
        createdBy: 'cli@export-parchi',
        createdByName: 'CLI export-parchi',
      });
    } catch (error) {
      if (error instanceof PollingStationRequiredError) {
        const override = await askQuestion(
          `Polling station required for block ${error.blockCode}. Enter polling station (exact text): `
        );
        if (!override.trim()) throw error;

        webJob = await createParchiJob({
          halkaName: job.halkaName,
          designId: job.designId,
          blockCodes: [blockCode],
          selectAllBlockCodes: false,
          genderFilter: job.genderFilter,
          skipRowCrops: false,
          skipRemoteUpload: true,
          createdBy: 'cli@export-parchi',
          createdByName: 'CLI export-parchi',
          pollingStationOverride: override.trim(),
        });
      } else {
        throw error;
      }
    }

    if (!webJob._id) {
      return updateJob(db, job._id, {
        status: 'failed',
        error: `Failed to create web parchi job for block ${blockCode}`,
      });
    }

    if (webJob.status === 'failed') {
      // No voters (or immediate failure) — skip to next block.
      const nextIndex = job.currentBlockIndex + 1;
      const fields: Record<string, unknown> = {
        currentBlockIndex: nextIndex,
        currentBlockCode: nextIndex < job.blockCodes.length ? job.blockCodes[nextIndex] : null,
        activeWebJobId: null,
        lastVoterId: null,
        partFiles: [],
        status: nextIndex >= job.blockCodes.length ? 'completed' : 'running',
        completedAt: nextIndex >= job.blockCodes.length ? new Date() : null,
        error: null,
      };
      return updateJob(db, job._id, fields);
    }

    webJobId = webJob._id;
    await updateJob(db, job._id, {
      activeWebJobId: webJobId,
      currentBlockCode: blockCode,
      status: 'running',
      error: null,
    });
  }

  // Retrofit jobs created before these flags existed (resume of stuck exports).
  await db.collection('voter_parchi_jobs').updateOne(
    { _id: new ObjectId(webJobId) },
    { $set: { skipRemoteUpload: true, updatedAt: new Date() } }
  );

  const webJob = await processParchiBatch(webJobId);
  if (!webJob) {
    return updateJob(db, job._id, {
      status: 'failed',
      error: `Web parchi job missing for block ${blockCode}`,
      activeWebJobId: null,
    });
  }

  const processedVoters = job.completedBlocksVoters + webJob.processedVoters;

  if (webJob.status === 'running' || webJob.status === 'pending') {
    return updateJob(db, job._id, {
      processedVoters,
      currentBlockCode: blockCode,
      activeWebJobId: webJobId,
      status: 'running',
      error: null,
    });
  }

  if (webJob.status === 'failed') {
    return updateJob(db, job._id, {
      status: 'failed',
      error: webJob.error || `Web parchi job failed for block ${blockCode}`,
      processedVoters,
      activeWebJobId: null,
    });
  }

  // completed / cancelled — prefer completed catalog file for console + optional --out copy
  const finalFiles = [...job.finalFiles];
  if (webJob.status === 'completed') {
    const copied = await copyLatestToOptionalOut(job, blockCode);
    if (copied) {
      finalFiles.push(copied);
    } else if (webJob.outputFiles.length > 0) {
      // Fallback: point at first server-side job part.
      const first = webJob.outputFiles[0];
      const local = (await getParchiLocalFilePath(webJobId, first.fileName)) ?? first.storagePath;
      finalFiles.push({
        fileName: first.fileName,
        localPath: local,
        voterCount: webJob.processedVoters,
        pageCount: webJob.outputFiles.reduce((sum, file) => sum + (file.pageCount || 0), 0),
        sizeBytes: webJob.outputFiles.reduce((sum, file) => sum + (file.sizeBytes || 0), 0),
        blockCode,
      });
    }
  }

  const completedBlocksVoters = job.completedBlocksVoters + webJob.processedVoters;
  const nextIndex = job.currentBlockIndex + 1;
  if (nextIndex >= job.blockCodes.length) {
    return updateJob(db, job._id, {
      processedVoters: completedBlocksVoters,
      completedBlocksVoters,
      lastVoterId: null,
      partFiles: [],
      finalFiles,
      currentBlockIndex: nextIndex,
      currentBlockCode: null,
      activeWebJobId: null,
      status: 'completed',
      completedAt: new Date(),
      error: null,
    });
  }

  return updateJob(db, job._id, {
    processedVoters: completedBlocksVoters,
    completedBlocksVoters,
    lastVoterId: null,
    partFiles: [],
    finalFiles,
    currentBlockIndex: nextIndex,
    currentBlockCode: job.blockCodes[nextIndex],
    activeWebJobId: null,
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
      return await updateJob(db, jobId, { status: 'failed', error: 'Design not found' });
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
      return await pauseParchiCliExportJob(jobId);
    }

    const job = await processParchiCliExportBatch(jobId);
    if (!job) return null;
    options?.onProgress?.(job);

    if (terminal.has(job.status)) {
      return job;
    }

    if (options?.shouldPause?.()) {
      return await pauseParchiCliExportJob(jobId);
    }
  }
}

/** Re-export for typing convenience against UI job shape when needed. */
export type { VoterParchiJob };
