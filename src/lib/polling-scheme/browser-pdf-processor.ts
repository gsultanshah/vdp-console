'use client';

import type { PollingSchemeAiJob } from '@/lib/polling-scheme/ai-job-types';

export interface BrowserPdfProcessorCallbacks {
  onUploadProgress?: (loaded: number, total: number) => void;
  onPageProgress?: (page: number, total: number, stage: string) => void;
  onLog?: (message: string) => void;
  onJobUpdate?: (job: PollingSchemeAiJob) => void;
}

export interface BrowserPdfProcessorOptions extends BrowserPdfProcessorCallbacks {
  signal?: AbortSignal;
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256HexFromBlob(blob: Blob): Promise<string> {
  return sha256Hex(await blob.arrayBuffer());
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true }
    );
  });
}

async function fetchWithBackoff(
  input: RequestInfo,
  init: RequestInit,
  signal?: AbortSignal,
  retries = 3,
  timeoutMs = 120_000
): Promise<Response> {
  let attempt = 0;
  while (true) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });

    try {
      const response = await fetch(input, { ...init, signal: controller.signal });
      if (response.ok || response.status < 500 || attempt >= retries) {
        return response;
      }
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }
      if (attempt >= retries) {
        if (controller.signal.aborted) {
          throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)} seconds`);
        }
        throw error;
      }
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
    attempt += 1;
    await sleep(500 * 2 ** attempt, signal);
  }
}

export async function computeFileSha256(file: File): Promise<string> {
  return sha256Hex(await file.arrayBuffer());
}

export async function uploadResumablePdf(
  sessionUrl: string,
  file: File,
  onProgress?: (loaded: number, total: number) => void,
  signal?: AbortSignal
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', sessionUrl);
    xhr.setRequestHeader('Content-Type', file.type || 'application/pdf');

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.(event.loaded, event.total);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`PDF upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('PDF upload network error'));
    xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'));

    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

async function loadPdfDocument(file: File) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc =
      'https://unpkg.com/pdfjs-dist@4.10.38/legacy/build/pdf.worker.min.mjs';
  }

  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data });
  return loadingTask.promise;
}

export async function renderPdfPageToJpeg(
  file: File,
  pageNumber: number,
  scale = 2
): Promise<Blob> {
  const pdf = await loadPdfDocument(file);
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas not supported');
  }

  await page.render({ canvasContext: context, viewport }).promise;
  page.cleanup();
  pdf.destroy();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('Failed to render JPEG'))),
      'image/jpeg',
      0.92
    );
  });

  canvas.width = 0;
  canvas.height = 0;
  return blob;
}

export async function countPdfPages(file: File): Promise<number> {
  const pdf = await loadPdfDocument(file);
  const count = pdf.numPages;
  pdf.destroy();
  return count;
}

export async function runPollingSchemeAiJob(input: {
  file: File;
  halkaName: string;
  district?: string;
  existingJob?: PollingSchemeAiJob | null;
  options?: BrowserPdfProcessorOptions;
}): Promise<PollingSchemeAiJob> {
  const { file, halkaName, district, existingJob, options } = input;
  const signal = options?.signal;

  options?.onLog?.('Computing file hash…');
  const fileHash = await computeFileSha256(file);

  let job = existingJob ?? null;
  let resumableUploadUrl: string | null = null;

  if (!job || job.fileHash !== fileHash) {
    const createResponse = await fetchWithBackoff(
      '/api/polling-scheme/ai-jobs',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          halkaName,
          district,
          fileName: file.name,
          fileHash,
          fileSizeBytes: file.size,
        }),
      },
      signal
    );
    const createData = await createResponse.json();
    if (!createResponse.ok) {
      throw new Error(createData.error || 'Failed to create job');
    }
    job = createData.job as PollingSchemeAiJob;
    resumableUploadUrl = createData.resumableUploadUrl as string;
    options?.onJobUpdate?.(job);
  }

  if (!job) {
    throw new Error('Job not initialized');
  }

  if (job.status === 'pending_upload') {
    if (!resumableUploadUrl) {
      const recreate = await fetchWithBackoff(
        '/api/polling-scheme/ai-jobs',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            halkaName,
            district,
            fileName: file.name,
            fileHash,
            fileSizeBytes: file.size,
          }),
        },
        signal
      );
      const recreateData = await recreate.json();
      if (!recreate.ok) {
        throw new Error(recreateData.error || 'Failed to get upload URL');
      }
      resumableUploadUrl = recreateData.resumableUploadUrl as string;
      job = recreateData.job as PollingSchemeAiJob;
    }

    options?.onLog?.('Uploading PDF to storage…');
    await uploadResumablePdf(
      resumableUploadUrl,
      file,
      options?.onUploadProgress,
      signal
    );

    options?.onLog?.('Counting PDF pages…');
    const pageCount = await countPdfPages(file);

    const uploadedResponse = await fetchWithBackoff(
      `/api/polling-scheme/ai-jobs/${job._id}/uploaded`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageCount }),
      },
      signal
    );
    const uploadedData = await uploadedResponse.json();
    if (!uploadedResponse.ok) {
      throw new Error(uploadedData.error || 'Failed to confirm PDF upload');
    }
    job = uploadedData.job as PollingSchemeAiJob;
    options?.onJobUpdate?.(job);
  }

  const totalPages = job.pageCount ?? job.pages.length;
  if (!totalPages) {
    throw new Error('Page count not available');
  }

  for (let page = 1; page <= totalPages; page += 1) {
    signal?.throwIfAborted?.();

    const pageState = job.pages.find((item) => item.page === page);
    if (pageState?.status === 'completed') {
      options?.onPageProgress?.(page, totalPages, 'skipped');
      continue;
    }

    options?.onPageProgress?.(page, totalPages, 'rendering');
    options?.onLog?.(`Rendering page ${page}/${totalPages}…`);

    const jpegBlob = await renderPdfPageToJpeg(file, page);
    const imageHash = await sha256HexFromBlob(jpegBlob);

    options?.onPageProgress?.(page, totalPages, 'uploading');
    options?.onLog?.(`Uploading page ${page}/${totalPages}…`);
    const pageUploadResponse = await fetchWithBackoff(
      `/api/polling-scheme/ai-jobs/${job._id}/pages/${page}/upload-url`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'image/jpeg',
          'X-Image-Sha256': imageHash,
        },
        body: jpegBlob,
      },
      signal
    );
    const pageUploadData = await pageUploadResponse.json();
    if (!pageUploadResponse.ok) {
      throw new Error(pageUploadData.error || `Failed to upload page image ${page}`);
    }

    options?.onPageProgress?.(page, totalPages, 'extracting');
    options?.onLog?.(`Extracting page ${page}/${totalPages} with AI…`);

    const processResponse = await fetchWithBackoff(
      `/api/polling-scheme/ai-jobs/${job._id}/pages/${page}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageHash }),
      },
      signal
    );
    const processData = await processResponse.json();

    if (processResponse.status === 422 && processData.retryRecommended) {
      options?.onLog?.(`Validation issues on page ${page}, retrying with verification…`);
      const retryResponse = await fetchWithBackoff(
        `/api/polling-scheme/ai-jobs/${job._id}/pages/${page}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageHash, retry: true }),
        },
        signal
      );
      const retryData = await retryResponse.json();
      if (!retryResponse.ok) {
        throw new Error(retryData.error || `Page ${page} extraction failed`);
      }
      job = retryData.job as PollingSchemeAiJob;
    } else if (!processResponse.ok) {
      throw new Error(processData.error || `Page ${page} extraction failed`);
    } else {
      job = processData.job as PollingSchemeAiJob;
    }

    options?.onJobUpdate?.(job);
    options?.onPageProgress?.(page, totalPages, 'completed');
  }

  options?.onLog?.('Finalizing job…');
  const finalizeResponse = await fetchWithBackoff(
    `/api/polling-scheme/ai-jobs/${job._id}/finalize`,
    { method: 'POST' },
    signal
  );
  const finalizeData = await finalizeResponse.json();
  if (!finalizeResponse.ok) {
    throw new Error(finalizeData.error || 'Failed to finalize job');
  }

  const finalJob = finalizeData.job as PollingSchemeAiJob;
  options?.onJobUpdate?.(finalJob);
  options?.onLog?.(`Job ${finalJob.status}: ${finalJob.counters.rowsUpserted} rows upserted`);
  return finalJob;
}
