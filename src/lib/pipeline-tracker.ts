import { MongoClient } from 'mongodb';
import { getFirebaseDatabase } from '@/lib/firebase-admin';
import { isFirebasePipelineConfigured } from '@/config/firebase';
import {
  createEmptyPipelineMeta,
  type PdfUploadJob,
  type PipelineMeta,
  type PipelinePageState,
  type PipelineStageKey,
  type StageCounts,
  type UploadSession,
} from '@/lib/pipeline-types';

function pipelineHalkaKey(halkaName: string): string {
  return halkaName.replace(/\s+/g, '').toUpperCase().replace(/[.#$/[\]]/g, '_');
}

function metaRef(halkaName: string) {
  const db = getFirebaseDatabase();
  if (!db) {
    return null;
  }
  return db.ref(`pipeline/${pipelineHalkaKey(halkaName)}/meta`);
}

function sessionsRef(halkaName: string) {
  const db = getFirebaseDatabase();
  if (!db) {
    return null;
  }
  return db.ref(`pipeline/${pipelineHalkaKey(halkaName)}/sessions`);
}

function pagesRef(halkaName: string) {
  const db = getFirebaseDatabase();
  if (!db) {
    return null;
  }
  return db.ref(`pipeline/${pipelineHalkaKey(halkaName)}/pages`);
}

function jobsRef(halkaName: string) {
  const db = getFirebaseDatabase();
  if (!db) {
    return null;
  }
  return db.ref(`pipeline/${pipelineHalkaKey(halkaName)}/jobs`);
}

function eventsRef(halkaName: string) {
  const db = getFirebaseDatabase();
  if (!db) {
    return null;
  }
  return db.ref(`pipeline/${pipelineHalkaKey(halkaName)}/events`);
}

function runPipelineWrite(label: string, task: () => Promise<void>): void {
  if (!isFirebasePipelineConfigured()) {
    return;
  }

  void task().catch((error) => {
    console.error(`[pipeline] ${label} failed:`, error);
  });
}

async function ensureMeta(halkaName: string): Promise<PipelineMeta> {
  const ref = metaRef(halkaName);
  if (!ref) {
    return createEmptyPipelineMeta();
  }

  const snapshot = await ref.get();
  if (!snapshot.exists()) {
    const meta = createEmptyPipelineMeta();
    await ref.set(meta);
    return meta;
  }

  return { ...createEmptyPipelineMeta(), ...(snapshot.val() as PipelineMeta) };
}

async function adjustStageCounter(
  halkaName: string,
  stage: PipelineStageKey,
  field: keyof StageCounts,
  delta: number
): Promise<void> {
  const ref = metaRef(halkaName);
  if (!ref || delta === 0) {
    return;
  }

  await ref.transaction((current) => {
    const meta = { ...createEmptyPipelineMeta(), ...(current ?? {}) } as PipelineMeta;
    meta.stages = { ...createEmptyPipelineMeta().stages, ...meta.stages };
    meta.stages[stage] = { ...createEmptyPipelineMeta().stages[stage], ...meta.stages[stage] };
    meta.stages[stage][field] = Math.max(0, (meta.stages[stage][field] ?? 0) + delta);
    meta.updatedAt = Date.now();
    return meta;
  });
}

async function pushEvent(
  halkaName: string,
  event: {
    type: string;
    blockCode?: string;
    pageId?: string;
    sessionId?: string;
    message?: string;
  }
): Promise<void> {
  const ref = eventsRef(halkaName);
  if (!ref) {
    return;
  }

  await ref.push({
    ...event,
    at: Date.now(),
  });
}

export async function readPipelineMeta(halkaName: string): Promise<PipelineMeta | null> {
  const ref = metaRef(halkaName);
  if (!ref) {
    return null;
  }

  const snapshot = await ref.get();
  if (!snapshot.exists()) {
    return createEmptyPipelineMeta();
  }

  return { ...createEmptyPipelineMeta(), ...(snapshot.val() as PipelineMeta) };
}

export async function readUploadSessions(halkaName: string): Promise<UploadSession[]> {
  const ref = sessionsRef(halkaName);
  if (!ref) {
    return [];
  }

  const snapshot = await ref.get();
  if (!snapshot.exists()) {
    return [];
  }

  return Object.entries(snapshot.val() as Record<string, UploadSession>).map(([sessionId, session]) => ({
    ...session,
    sessionId,
  }));
}

export function trackUploadSessionStart(halkaName: string, sessionId: string, operatorId = 'uploader'): void {
  runPipelineWrite('upload session start', async () => {
    await ensureMeta(halkaName);
    const now = Date.now();
    await sessionsRef(halkaName)?.child(sessionId).set({
      sessionId,
      operatorId,
      startedAt: now,
      lastHeartbeatAt: now,
      status: 'running',
      currentBlockCode: null,
      filesUploaded: 0,
      filesFailed: 0,
      filesInFlight: 0,
    } satisfies UploadSession);

    const metaRefValue = metaRef(halkaName);
    if (metaRefValue) {
      await metaRefValue.transaction((current) => {
        const meta = { ...createEmptyPipelineMeta(), ...(current ?? {}) } as PipelineMeta;
        meta.activeUploadSessions = (meta.activeUploadSessions ?? 0) + 1;
        meta.updatedAt = Date.now();
        return meta;
      });
    }

    await pushEvent(halkaName, { type: 'upload_session_start', sessionId, message: operatorId });
  });
}

export function trackUploadSessionEnd(
  halkaName: string,
  sessionId: string,
  status: 'completed' | 'failed'
): void {
  runPipelineWrite('upload session end', async () => {
    await sessionsRef(halkaName)?.child(sessionId).update({
      status,
      lastHeartbeatAt: Date.now(),
      filesInFlight: 0,
      currentBlockCode: null,
    });

    const metaRefValue = metaRef(halkaName);
    if (metaRefValue) {
      await metaRefValue.transaction((current) => {
        const meta = { ...createEmptyPipelineMeta(), ...(current ?? {}) } as PipelineMeta;
        meta.activeUploadSessions = Math.max(0, (meta.activeUploadSessions ?? 0) - 1);
        meta.updatedAt = Date.now();
        return meta;
      });
    }

    await pushEvent(halkaName, { type: 'upload_session_end', sessionId, message: status });
  });
}

export function trackUploadFileStart(
  halkaName: string,
  sessionId: string,
  blockCode: string,
  pageKey: string,
  fileName: string
): void {
  runPipelineWrite('upload file start', async () => {
    await sessionsRef(halkaName)?.child(sessionId).transaction((session) => {
      if (!session) {
        return session;
      }
      return {
        ...session,
        currentBlockCode: blockCode,
        lastHeartbeatAt: Date.now(),
        filesInFlight: (session.filesInFlight ?? 0) + 1,
      };
    });

    await pagesRef(halkaName)?.child(pageKey).set({
      pageId: pageKey,
      blockCode,
      fileName,
      stage: 'upload',
      status: 'uploading',
      sessionId,
      updatedAt: Date.now(),
    } satisfies PipelinePageState);

    await adjustStageCounter(halkaName, 'upload', 'inFlight', 1);
  });
}

export function trackUploadFileComplete(
  halkaName: string,
  sessionId: string,
  blockCode: string,
  pageKey: string,
  mongoPageId: string,
  fileName: string
): void {
  runPipelineWrite('upload file complete', async () => {
    await sessionsRef(halkaName)?.child(sessionId).transaction((session) => {
      if (!session) {
        return session;
      }
      return {
        ...session,
        filesUploaded: (session.filesUploaded ?? 0) + 1,
        filesInFlight: Math.max(0, (session.filesInFlight ?? 0) - 1),
        lastHeartbeatAt: Date.now(),
      };
    });

    await pagesRef(halkaName)?.child(mongoPageId).set({
      pageId: mongoPageId,
      blockCode,
      fileName,
      stage: 'upload',
      status: 'uploaded',
      sessionId,
      updatedAt: Date.now(),
    } satisfies PipelinePageState);

    if (pageKey !== mongoPageId) {
      await pagesRef(halkaName)?.child(pageKey).remove();
    }

    await adjustStageCounter(halkaName, 'upload', 'inFlight', -1);
    await adjustStageCounter(halkaName, 'upload', 'completed', 1);
    await adjustStageCounter(halkaName, 'titleTagging', 'pending', 1);

    await pushEvent(halkaName, {
      type: 'upload_complete',
      blockCode,
      pageId: mongoPageId,
      sessionId,
      message: fileName,
    });
  });
}

export function trackUploadFileFailed(
  halkaName: string,
  sessionId: string,
  blockCode: string,
  pageKey: string,
  errorMessage: string
): void {
  runPipelineWrite('upload file failed', async () => {
    await sessionsRef(halkaName)?.child(sessionId).transaction((session) => {
      if (!session) {
        return session;
      }
      return {
        ...session,
        filesFailed: (session.filesFailed ?? 0) + 1,
        filesInFlight: Math.max(0, (session.filesInFlight ?? 0) - 1),
        lastHeartbeatAt: Date.now(),
      };
    });

    await pagesRef(halkaName)?.child(pageKey).update({
      stage: 'error',
      status: 'failed',
      error: errorMessage,
      updatedAt: Date.now(),
    });

    await adjustStageCounter(halkaName, 'upload', 'inFlight', -1);
    await adjustStageCounter(halkaName, 'upload', 'failed', 1);

    await pushEvent(halkaName, {
      type: 'upload_failed',
      blockCode,
      sessionId,
      message: errorMessage,
    });
  });
}

export function trackPageStageUpdate(input: {
  halkaName: string;
  blockCode: string;
  pageId: string;
  fileName?: string;
  stage: PipelineStageKey | 'error';
  status: string;
  error?: string;
  integrityPassed?: boolean;
}): void {
  runPipelineWrite(`page stage ${input.stage}`, async () => {
    await pagesRef(input.halkaName)?.child(input.pageId).set({
      pageId: input.pageId,
      blockCode: input.blockCode,
      fileName: input.fileName ?? input.pageId,
      stage: input.stage,
      status: input.status,
      updatedAt: Date.now(),
      error: input.error,
    } satisfies PipelinePageState);

    if (input.stage === 'error') {
      return;
    }

    if (input.status === 'completed') {
      await adjustStageCounter(input.halkaName, input.stage, 'completed', 1);
      await adjustStageCounter(input.halkaName, input.stage, 'pending', -1);
      await adjustStageCounter(input.halkaName, input.stage, 'inFlight', -1);
    } else if (input.status === 'error' || input.status === 'failed') {
      await adjustStageCounter(input.halkaName, input.stage, 'failed', 1);
      await adjustStageCounter(input.halkaName, input.stage, 'pending', -1);
      await adjustStageCounter(input.halkaName, input.stage, 'inFlight', -1);
    } else if (input.status === 'processing' || input.status === 'running' || input.status === 'uploading') {
      await adjustStageCounter(input.halkaName, input.stage, 'inFlight', 1);
    }

    if (input.stage === 'integrity') {
      if (input.integrityPassed) {
        await adjustStageCounter(input.halkaName, 'integrity', 'completed', 1);
      } else {
        await adjustStageCounter(input.halkaName, 'integrity', 'failed', 1);
      }
      await adjustStageCounter(input.halkaName, 'integrity', 'pending', -1);
    }

    await pushEvent(input.halkaName, {
      type: `${input.stage}_${input.status}`,
      blockCode: input.blockCode,
      pageId: input.pageId,
      message: input.error,
    });
  });
}

export function trackBlockCodeTitleTagged(halkaName: string, blockCode: string, pageCount: number): void {
  runPipelineWrite('title tagged', async () => {
    if (pageCount > 0) {
      await adjustStageCounter(halkaName, 'titleTagging', 'completed', pageCount);
      await adjustStageCounter(halkaName, 'titleTagging', 'pending', -pageCount);
      await adjustStageCounter(halkaName, 'ocr', 'pending', pageCount);
    }
    await pushEvent(halkaName, { type: 'title_tagging_complete', blockCode, message: `${pageCount} pages` });
  });
}

export async function syncPipelineCountsFromMongo(halkaName: string): Promise<PipelineMeta | null> {
  if (!isFirebasePipelineConfigured()) {
    return null;
  }

  const client = await MongoClient.connect(process.env.NEXT_PUBLIC_MONGODB_URI!);
  const db = client.db();

  try {
    const normalizedHalka = halkaName.replace(/\s+/g, '').toUpperCase();
    const pages = await db
      .collection('blockcodes')
      .find({ halkaName: normalizedHalka })
      .project({
        status: 1,
        tag: 1,
        ocrAt: 1,
        processedAt: 1,
        voterEnrichAt: 1,
        blockCode: 1,
        uploadedAt: 1,
      })
      .toArray();

    const constituency = await db.collection('constituencies').findOne({ halkaName: normalizedHalka });
    const blockCodesTotal = constituency?.blockCodes?.length ?? new Set(pages.map((p) => p.blockCode)).size;

    const meta = createEmptyPipelineMeta();
    meta.blockCodesTotal = blockCodesTotal;
    meta.stages.upload.total = pages.length;

    for (const page of pages) {
      const hasOcr = Boolean(page.ocrAt);
      const processed = Boolean(page.processedAt) || page.status === 'completed';
      const enriched = Boolean(page.voterEnrichAt);
      const isError = page.status === 'error';
      const isTitle = page.tag === 'title';

      meta.stages.upload.completed += 1;

      if (isTitle) {
        meta.stages.titleTagging.completed += 1;
      } else {
        meta.stages.titleTagging.pending += 1;
      }

      if (hasOcr) {
        meta.stages.ocr.completed += 1;
      } else if (!isTitle && !isError) {
        meta.stages.ocr.pending += 1;
      }

      if (processed) {
        meta.stages.processing.completed += 1;
      } else if (hasOcr && !isError) {
        meta.stages.processing.pending += 1;
      }

      if (enriched) {
        meta.stages.enrichment.completed += 1;
        meta.stages.integrity.completed += 1;
      } else if (processed && !isError) {
        meta.stages.enrichment.pending += 1;
        meta.stages.integrity.pending += 1;
      }

      if (isError) {
        meta.stages.processing.failed += 1;
      }
    }

    meta.stages.upload.pending = Math.max(0, meta.stages.upload.total - meta.stages.upload.completed);
    meta.updatedAt = Date.now();

    await metaRef(halkaName)?.set(meta);
    return meta;
  } finally {
    await client.close();
  }
}

export function trackPdfJobUpdate(halkaName: string, job: PdfUploadJob): void {
  runPipelineWrite('pdf job update', async () => {
    await jobsRef(halkaName)?.child(job.jobId).set(job);
    await pushEvent(halkaName, {
      type: `pdf_job_${job.status}`,
      blockCode: job.blockCode,
      sessionId: job.sessionId,
      message: `${job.uploadedPages}/${job.totalPages} pages uploaded`,
    });
  });
}

export async function readPdfUploadJobs(halkaName: string): Promise<PdfUploadJob[]> {
  const ref = jobsRef(halkaName);
  if (!ref) {
    return [];
  }

  const snapshot = await ref.get();
  if (!snapshot.exists()) {
    return [];
  }

  return Object.entries(snapshot.val() as Record<string, PdfUploadJob>).map(([jobId, job]) => ({
    ...job,
    jobId,
  }));
}

export function trackPdfExtractStart(halkaName: string, pageCount: number): void {
  runPipelineWrite('pdf extract start', async () => {
    await adjustStageCounter(halkaName, 'pdfExtract', 'total', pageCount);
    await adjustStageCounter(halkaName, 'pdfExtract', 'inFlight', pageCount);
  });
}

export function trackPdfExtractPageComplete(halkaName: string): void {
  runPipelineWrite('pdf extract page complete', async () => {
    await adjustStageCounter(halkaName, 'pdfExtract', 'inFlight', -1);
    await adjustStageCounter(halkaName, 'pdfExtract', 'completed', 1);
  });
}

export function trackPdfExtractPageFailed(halkaName: string): void {
  runPipelineWrite('pdf extract page failed', async () => {
    await adjustStageCounter(halkaName, 'pdfExtract', 'inFlight', -1);
    await adjustStageCounter(halkaName, 'pdfExtract', 'failed', 1);
  });
}

export function getPipelineHalkaKey(halkaName: string): string {
  return pipelineHalkaKey(halkaName);
}

export async function readPipelinePages(halkaName: string): Promise<PipelinePageState[]> {
  const ref = pagesRef(halkaName);
  if (!ref) {
    return [];
  }

  const snapshot = await ref.get();
  if (!snapshot.exists()) {
    return [];
  }

  return Object.entries(snapshot.val() as Record<string, PipelinePageState>).map(([pageId, page]) => ({
    ...page,
    pageId,
  }));
}

export async function readPipelineEvents(
  halkaName: string,
  limit = 30
): Promise<Array<{ id: string; type: string; at: number; blockCode?: string; pageId?: string; message?: string }>> {
  const ref = eventsRef(halkaName);
  if (!ref) {
    return [];
  }

  try {
    const snapshot = await ref.get();

    if (!snapshot.exists()) {
      return [];
    }

    return Object.entries(
      snapshot.val() as Record<string, { type: string; at: number; blockCode?: string; pageId?: string; message?: string }>
    )
      .map(([id, event]) => ({ id, ...event }))
      .sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
      .slice(0, limit);
  } catch (error) {
    console.error('[pipeline] read events failed:', error);
    return [];
  }
}
