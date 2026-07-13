import { ObjectId, type Collection } from 'mongodb';
import connectDB from '@/lib/mongodb';
import {
  MAX_AI_JOB_LOGS,
  POLLING_SCHEME_AI_COLLECTION,
  pollingSchemePagePath,
  pollingSchemeSourcePath,
  type CreatePollingSchemeAiJobInput,
  type PollingSchemeAiJob,
  type PollingSchemeAiJobCounters,
  type PollingSchemeAiJobStatus,
  type PollingSchemeAiLogEntry,
  type PollingSchemeAiPageState,
  type PollingSchemeAiStationContext,
} from '@/lib/polling-scheme/ai-job-types';
import { appendPollingSchemeAiLog, mirrorPollingSchemeAiJob } from '@/lib/polling-scheme/ai-job-tracker';
import { getPollingSchemeExtractionModel } from '@/lib/polling-scheme/openai-extractor';
import { createResumableUploadSession, getSignedReadUrl } from '@/lib/firebase-storage';

interface PollingSchemeAiJobDoc {
  _id: ObjectId;
  halkaName: string;
  district: string;
  status: PollingSchemeAiJobStatus;
  fileName: string;
  fileHash: string;
  fileSizeBytes: number;
  pageCount: number | null;
  sourceStoragePath: string;
  sourceFileUrl?: string;
  pages: PollingSchemeAiPageState[];
  counters: PollingSchemeAiJobCounters;
  logs: PollingSchemeAiLogEntry[];
  lastStationContext: PollingSchemeAiStationContext | null;
  operator: string;
  model: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  errorMessage?: string;
}

function emptyCounters(pageCount: number | null = null): PollingSchemeAiJobCounters {
  return {
    pagesCompleted: 0,
    pagesFailed: 0,
    pagesTotal: pageCount ?? 0,
    rowsExtracted: 0,
    rowsUpserted: 0,
    rowsSkipped: 0,
    warnings: 0,
    errors: 0,
  };
}

function toIso(value: Date | string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  return value instanceof Date ? value.toISOString() : value;
}

function serializeJob(doc: PollingSchemeAiJobDoc): PollingSchemeAiJob {
  return {
    _id: doc._id.toString(),
    halkaName: doc.halkaName,
    district: doc.district,
    status: doc.status,
    fileName: doc.fileName,
    fileHash: doc.fileHash,
    fileSizeBytes: doc.fileSizeBytes,
    pageCount: doc.pageCount,
    sourceStoragePath: doc.sourceStoragePath,
    sourceFileUrl: doc.sourceFileUrl,
    pages: doc.pages ?? [],
    counters: doc.counters ?? emptyCounters(doc.pageCount),
    logs: doc.logs ?? [],
    lastStationContext: doc.lastStationContext ?? null,
    operator: doc.operator,
    model: doc.model,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    completedAt: toIso(doc.completedAt),
    errorMessage: doc.errorMessage,
  };
}

async function getCollection(): Promise<Collection<PollingSchemeAiJobDoc>> {
  await connectDB();
  const { default: mongoose } = await import('mongoose');
  return mongoose.connection.collection(
    POLLING_SCHEME_AI_COLLECTION
  ) as unknown as Collection<PollingSchemeAiJobDoc>;
}

export async function ensurePollingSchemeAiJobIndexes(): Promise<void> {
  const collection = await getCollection();
  await collection.createIndex({ halkaName: 1, createdAt: -1 });
  await collection.createIndex({ fileHash: 1, halkaName: 1 });
  await collection.createIndex({ status: 1, updatedAt: -1 });
}

function appendLog(
  doc: PollingSchemeAiJobDoc,
  entry: Omit<PollingSchemeAiLogEntry, 'at'>
): PollingSchemeAiLogEntry {
  const full: PollingSchemeAiLogEntry = {
    at: new Date().toISOString(),
    ...entry,
  };
  doc.logs = [...(doc.logs ?? []), full].slice(-MAX_AI_JOB_LOGS);
  appendPollingSchemeAiLog(doc.halkaName, doc._id.toString(), full);
  return full;
}

function initPages(pageCount: number): PollingSchemeAiPageState[] {
  return Array.from({ length: pageCount }, (_, index) => ({
    page: index + 1,
    status: 'pending' as const,
  }));
}

export async function findPollingSchemeAiJobByHash(
  halkaName: string,
  fileHash: string
): Promise<PollingSchemeAiJob | null> {
  const collection = await getCollection();
  const doc = await collection.findOne({
    halkaName: halkaName.replace(/\s+/g, '').toUpperCase(),
    fileHash,
    status: { $in: ['pending_upload', 'uploaded', 'processing', 'paused', 'partial'] },
  });
  return doc ? serializeJob(doc) : null;
}

export async function listPollingSchemeAiJobs(
  halkaName: string,
  limit = 20
): Promise<PollingSchemeAiJob[]> {
  const collection = await getCollection();
  const docs = await collection
    .find({ halkaName: halkaName.replace(/\s+/g, '').toUpperCase() })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  return docs.map(serializeJob);
}

export async function getPollingSchemeAiJob(jobId: string): Promise<PollingSchemeAiJob | null> {
  if (!ObjectId.isValid(jobId)) {
    return null;
  }
  const collection = await getCollection();
  const doc = await collection.findOne({ _id: new ObjectId(jobId) });
  return doc ? serializeJob(doc) : null;
}

export async function createPollingSchemeAiJob(
  input: CreatePollingSchemeAiJobInput
): Promise<{ job: PollingSchemeAiJob; resumableUploadUrl: string }> {
  await ensurePollingSchemeAiJobIndexes();

  const halkaName = input.halkaName.replace(/\s+/g, '').toUpperCase();
  const existing = await findPollingSchemeAiJobByHash(halkaName, input.fileHash);
  if (
    existing &&
    ['pending_upload', 'uploaded', 'processing', 'paused', 'partial'].includes(existing.status)
  ) {
    const resumableUploadUrl = await createResumableUploadSession(
      existing.sourceStoragePath,
      'application/pdf'
    );
    return { job: existing, resumableUploadUrl };
  }

  const now = new Date();
  const sourceStoragePath = pollingSchemeSourcePath(halkaName, input.fileHash);
  const doc: PollingSchemeAiJobDoc = {
    _id: new ObjectId(),
    halkaName,
    district: input.district?.trim() ?? '',
    status: 'pending_upload',
    fileName: input.fileName,
    fileHash: input.fileHash,
    fileSizeBytes: input.fileSizeBytes,
    pageCount: null,
    sourceStoragePath,
    pages: [],
    counters: emptyCounters(),
    logs: [],
    lastStationContext: null,
    operator: input.operator,
    model: getPollingSchemeExtractionModel(),
    createdAt: now,
    updatedAt: now,
  };

  appendLog(doc, {
    level: 'info',
    message: `Job created for ${input.fileName} (${input.fileHash.slice(0, 12)}…)`,
  });

  const collection = await getCollection();
  await collection.insertOne(doc);

  const job = serializeJob(doc);
  mirrorPollingSchemeAiJob(job);

  const resumableUploadUrl = await createResumableUploadSession(
    sourceStoragePath,
    'application/pdf'
  );

  return { job, resumableUploadUrl };
}

export async function markPollingSchemePdfUploaded(
  jobId: string,
  pageCount: number,
  sourceFileUrl?: string
): Promise<PollingSchemeAiJob | null> {
  const collection = await getCollection();
  const doc = await collection.findOne({ _id: new ObjectId(jobId) });
  if (!doc) {
    return null;
  }

  const now = new Date();
  doc.pageCount = pageCount;
  doc.pages = initPages(pageCount);
  doc.counters = emptyCounters(pageCount);
  doc.status = 'uploaded';
  doc.sourceFileUrl = sourceFileUrl ?? doc.sourceFileUrl;
  doc.updatedAt = now;
  appendLog(doc, { level: 'info', message: `PDF uploaded with ${pageCount} pages` });

  await collection.replaceOne({ _id: doc._id }, doc);
  const job = serializeJob(doc);
  mirrorPollingSchemeAiJob(job);
  return job;
}

export async function updatePollingSchemeAiJobStatus(
  jobId: string,
  status: PollingSchemeAiJobStatus,
  errorMessage?: string
): Promise<PollingSchemeAiJob | null> {
  const collection = await getCollection();
  const doc = await collection.findOne({ _id: new ObjectId(jobId) });
  if (!doc) {
    return null;
  }

  doc.status = status;
  doc.updatedAt = new Date();
  if (errorMessage) {
    doc.errorMessage = errorMessage;
  }
  if (status === 'completed' || status === 'partial' || status === 'failed') {
    doc.completedAt = new Date();
  }

  await collection.replaceOne({ _id: doc._id }, doc);
  const job = serializeJob(doc);
  mirrorPollingSchemeAiJob(job);
  return job;
}

export async function getPollingSchemePageImagePath(
  job: PollingSchemeAiJob,
  page: number
): Promise<string> {
  return pollingSchemePagePath(job.halkaName, job.fileHash, page);
}

export async function markPageStatus(
  jobId: string,
  page: number,
  patch: Partial<PollingSchemeAiPageState>
): Promise<PollingSchemeAiJob | null> {
  const collection = await getCollection();
  const doc = await collection.findOne({ _id: new ObjectId(jobId) });
  if (!doc) {
    return null;
  }

  const pages = doc.pages ?? [];
  const index = pages.findIndex((item) => item.page === page);
  if (index < 0) {
    return null;
  }

  pages[index] = { ...pages[index], ...patch };
  doc.pages = pages;
  doc.updatedAt = new Date();

  await collection.replaceOne({ _id: doc._id }, doc);
  const job = serializeJob(doc);
  mirrorPollingSchemeAiJob(job);
  return job;
}

export async function recordPageProcessingResult(input: {
  jobId: string;
  page: number;
  pageState: Partial<PollingSchemeAiPageState>;
  rowsExtracted: number;
  rowsUpserted: number;
  rowsSkipped: number;
  warnings: number;
  errors: number;
  stationContext: PollingSchemeAiStationContext | null;
  logMessage: string;
  failed?: boolean;
}): Promise<PollingSchemeAiJob | null> {
  const collection = await getCollection();
  const doc = await collection.findOne({ _id: new ObjectId(input.jobId) });
  if (!doc) {
    return null;
  }

  const pages = doc.pages ?? [];
  const index = pages.findIndex((item) => item.page === input.page);
  if (index < 0) {
    return null;
  }

  const previous = pages[index];
  const wasCompleted = previous.status === 'completed';

  pages[index] = {
    ...previous,
    ...input.pageState,
    status: input.failed ? 'failed' : 'completed',
    processedAt: new Date().toISOString(),
    rowsExtracted: input.rowsExtracted,
    rowsUpserted: input.rowsUpserted,
    rowsSkipped: input.rowsSkipped,
  };

  doc.pages = pages;
  doc.lastStationContext = input.stationContext ?? doc.lastStationContext;
  doc.status = 'processing';
  doc.updatedAt = new Date();

  const counters = doc.counters ?? emptyCounters(doc.pageCount);
  if (!wasCompleted && !input.failed) {
    counters.pagesCompleted += 1;
  }
  if (input.failed && previous.status !== 'failed') {
    counters.pagesFailed += 1;
  }
  counters.rowsExtracted += input.rowsExtracted;
  counters.rowsUpserted += input.rowsUpserted;
  counters.rowsSkipped += input.rowsSkipped;
  counters.warnings += input.warnings;
  counters.errors += input.errors;
  doc.counters = counters;

  appendLog(doc, {
    level: input.failed ? 'error' : 'info',
    message: input.logMessage,
    page: input.page,
  });

  await collection.replaceOne({ _id: doc._id }, doc);
  const job = serializeJob(doc);
  mirrorPollingSchemeAiJob(job);
  return job;
}

export async function finalizePollingSchemeAiJob(jobId: string): Promise<PollingSchemeAiJob | null> {
  const collection = await getCollection();
  const doc = await collection.findOne({ _id: new ObjectId(jobId) });
  if (!doc) {
    return null;
  }

  const pages = doc.pages ?? [];
  const failed = pages.filter((page) => page.status === 'failed').length;
  const completed = pages.filter((page) => page.status === 'completed').length;
  const total = doc.pageCount ?? pages.length;

  if (failed > 0 && completed > 0) {
    doc.status = 'partial';
  } else if (failed > 0) {
    doc.status = 'failed';
  } else if (completed >= total && total > 0) {
    doc.status = 'completed';
  } else {
    doc.status = 'paused';
  }

  doc.completedAt = new Date();
  doc.updatedAt = doc.completedAt;
  appendLog(doc, {
    level: doc.status === 'failed' ? 'error' : 'info',
    message: `Job finalized as ${doc.status} (${completed}/${total} pages, ${doc.counters.rowsUpserted} rows upserted)`,
  });

  await collection.replaceOne({ _id: doc._id }, doc);
  const job = serializeJob(doc);
  mirrorPollingSchemeAiJob(job);
  return job;
}

export async function getPollingSchemeSourceReadUrl(job: PollingSchemeAiJob): Promise<string> {
  if (job.sourceFileUrl) {
    return job.sourceFileUrl;
  }
  return getSignedReadUrl(job.sourceStoragePath);
}
