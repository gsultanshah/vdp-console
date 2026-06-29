import { randomUUID } from 'crypto';
import { MongoClient } from 'mongodb';
import { extractPdfPages } from '@/lib/pdf-extract';
import { uploadBufferToFirebaseStorage } from '@/lib/firebase-storage';
import {
  trackPdfExtractPageComplete,
  trackPdfExtractPageFailed,
  trackPdfExtractStart,
  trackPdfJobUpdate,
  trackUploadFileComplete,
  trackUploadFileFailed,
  trackUploadFileStart,
  trackUploadSessionEnd,
  trackUploadSessionStart,
} from '@/lib/pipeline-tracker';
import type { PdfUploadJob, PdfUploadJobPage } from '@/lib/pipeline-types';

function normalizeHalkaName(halkaName: string): string {
  return halkaName.replace(/\s+/g, '').toUpperCase();
}

function pageTag(pageNumber: number): string {
  return pageNumber === 1 ? 'title' : 'regular';
}

function pageKey(blockCode: string, fileName: string): string {
  return `${blockCode}_${fileName.replace(/[.#$/[\]]/g, '_')}`;
}

function buildJobPages(totalPages: number): Record<string, PdfUploadJobPage> {
  const pages: Record<string, PdfUploadJobPage> = {};
  for (let i = 1; i <= totalPages; i += 1) {
    pages[String(i)] = { pageNumber: i, status: 'pending' };
  }
  return pages;
}

function updateJob(job: PdfUploadJob, patch: Partial<PdfUploadJob>): PdfUploadJob {
  const next = { ...job, ...patch, updatedAt: Date.now() };
  trackPdfJobUpdate(job.halkaName, next);
  return next;
}

export async function processPdfUpload(input: {
  pdfBuffer: Buffer;
  sourceFileName: string;
  halkaName: string;
  blockCode: string;
  operatorId: string;
}): Promise<PdfUploadJob> {
  const halkaName = normalizeHalkaName(input.halkaName);
  const jobId = randomUUID();
  const sessionId = randomUUID();
  const now = Date.now();

  let job: PdfUploadJob = {
    jobId,
    sessionId,
    blockCode: input.blockCode,
    sourceFileName: input.sourceFileName,
    halkaName,
    operatorId: input.operatorId,
    status: 'received',
    totalPages: 0,
    extractedPages: 0,
    uploadedPages: 0,
    failedPages: 0,
    startedAt: now,
    updatedAt: now,
    pages: {},
  };

  trackPdfJobUpdate(halkaName, job);
  trackUploadSessionStart(halkaName, sessionId, input.operatorId);

  const client = await MongoClient.connect(process.env.NEXT_PUBLIC_MONGODB_URI!);
  const db = client.db();

  try {
    job = updateJob(job, { status: 'extracting' });
    const extractedPages = await extractPdfPages(input.pdfBuffer, input.blockCode);
    job = updateJob(job, {
      totalPages: extractedPages.length,
      pages: buildJobPages(extractedPages.length),
    });

    trackPdfExtractStart(halkaName, extractedPages.length);
    job = updateJob(job, { status: 'uploading' });

    await db.collection('constituencies').updateOne(
      { halkaName },
      {
        $addToSet: { blockCodes: input.blockCode },
        $set: { updatedAt: new Date() },
      },
      { upsert: true }
    );

    const blockcodes = db.collection('blockcodes');

    for (const page of extractedPages) {
      const pages = { ...job.pages! };
      pages[String(page.pageNumber)] = {
        pageNumber: page.pageNumber,
        status: 'extracting',
      };
      job = updateJob(job, { pages });

      try {
        trackPdfExtractPageComplete(halkaName);
        job = updateJob(job, { extractedPages: job.extractedPages + 1 });

        pages[String(page.pageNumber)] = {
          pageNumber: page.pageNumber,
          status: 'extracted',
          fileName: page.fileName,
        };
        job = updateJob(job, { pages });

        const key = pageKey(input.blockCode, page.fileName);
        trackUploadFileStart(halkaName, sessionId, input.blockCode, key, page.fileName);

        pages[String(page.pageNumber)] = {
          ...pages[String(page.pageNumber)],
          status: 'uploading',
        };
        job = updateJob(job, { pages });

        const destination = `${halkaName}/${input.blockCode}/${page.fileName}`;
        const url = await uploadBufferToFirebaseStorage(page.buffer, destination);

        const insertResult = await blockcodes.insertOne({
          blockCode: input.blockCode,
          fileName: page.fileName,
          url,
          tag: pageTag(page.pageNumber),
          halkaName,
          gender: 'male',
          religion: 'muslim',
          status: 'uploaded',
          uploadedAt: new Date(),
          sourcePdf: input.sourceFileName,
          pdfPageNumber: page.pageNumber,
        });

        const mongoPageId = String(insertResult.insertedId);
        trackUploadFileComplete(
          halkaName,
          sessionId,
          input.blockCode,
          key,
          mongoPageId,
          page.fileName
        );

        pages[String(page.pageNumber)] = {
          pageNumber: page.pageNumber,
          status: 'uploaded',
          fileName: page.fileName,
          pageId: mongoPageId,
        };

        job = updateJob(job, {
          pages,
          uploadedPages: job.uploadedPages + 1,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Page processing failed';
        trackUploadFileFailed(
          halkaName,
          sessionId,
          input.blockCode,
          pageKey(input.blockCode, page.fileName),
          message
        );

        pages[String(page.pageNumber)] = {
          pageNumber: page.pageNumber,
          status: 'failed',
          fileName: page.fileName,
          error: message,
        };

        job = updateJob(job, {
          pages,
          failedPages: job.failedPages + 1,
          error: message,
        });
      }
    }

    const finalStatus = job.failedPages > 0 && job.uploadedPages === 0 ? 'failed' : 'completed';
    job = updateJob(job, { status: finalStatus });
    trackUploadSessionEnd(halkaName, sessionId, finalStatus === 'completed' ? 'completed' : 'failed');

    return job;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PDF upload failed';
    job = updateJob(job, { status: 'failed', error: message });
    trackUploadSessionEnd(halkaName, sessionId, 'failed');
    throw error;
  } finally {
    await client.close();
  }
}
