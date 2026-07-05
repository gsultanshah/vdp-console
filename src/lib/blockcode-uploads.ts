import type { UploadImage } from '@/components/constituency/ImageViewerModal';

export const UPLOAD_LIST_PROJECTION = {
  _id: 1,
  blockCode: 1,
  fileName: 1,
  url: 1,
  tag: 1,
  halkaName: 1,
  gender: 1,
  religion: 1,
  status: 1,
  uploadedAt: 1,
} as const;

export const UPLOAD_PAGE_ROW_SELECT = '_id fileName url status uploadedAt';

export interface UploadPageRow {
  _id: string;
  fileName: string;
  url: string;
  status: string;
  uploadedAt: string;
}

export const DEFAULT_UPLOAD_PAGE_SIZE = 50;
export const MAX_UPLOAD_PAGE_SIZE = 100;
export const UPLOAD_PREVIEW_COUNT = 5;
export const UPLOAD_STREAM_BATCH_SIZE = 5;

export interface UploadListQuery {
  blockCode?: string;
  halkaName?: string;
}

export interface UploadPageMeta {
  currentPage: number;
  pageSize: number;
}

export interface UploadPageResult extends UploadPageMeta {
  uploads: UploadImage[];
  total: number;
  totalPages: number;
}

export type UploadStreamEvent =
  | { type: 'meta'; currentPage: number; pageSize: number; previewCount: number }
  | { type: 'preview'; count: number }
  | { type: 'upload'; upload: UploadImage }
  | { type: 'done'; total: number; totalPages: number; currentPage: number; pageSize: number }
  | { type: 'error'; error: string };

export function buildUploadListQueryString(
  query: UploadListQuery,
  page: number,
  limit: number,
  options?: { stream?: boolean; view?: 'pages' | 'list' }
): string {
  const params = new URLSearchParams();
  if (query.blockCode) {
    params.set('blockCode', query.blockCode);
  }
  if (query.halkaName) {
    params.set('halkaName', query.halkaName);
  }
  params.set('page', String(page));
  params.set('limit', String(limit));
  params.set('lite', 'true');
  if (options?.view === 'pages') {
    params.set('view', 'pages');
  }
  if (options?.stream) {
    params.set('stream', 'true');
  }
  return params.toString();
}

export function normalizeUploadPageRow(raw: Record<string, unknown>): UploadPageRow {
  return {
    _id: String(raw._id ?? ''),
    fileName: String(raw.fileName ?? ''),
    url: String(raw.url ?? ''),
    status: String(raw.status ?? ''),
    uploadedAt:
      raw.uploadedAt instanceof Date
        ? raw.uploadedAt.toISOString()
        : String(raw.uploadedAt ?? ''),
  };
}

export async function fetchUploadPageRows(
  query: UploadListQuery,
  page: number,
  limit: number,
  signal?: AbortSignal
): Promise<{
  uploads: UploadPageRow[];
  currentPage: number;
  totalPages: number;
  total: number;
  pageSize: number;
}> {
  const params = buildUploadListQueryString(query, page, limit, { view: 'pages' });
  const response = await fetch(`/api/blockcodes/?${params}`, { signal });

  if (!response.ok) {
    let message = `Failed to load pages (HTTP ${response.status})`;
    try {
      const data = (await response.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }

  const data = (await response.json()) as {
    uploads?: Record<string, unknown>[];
    currentPage: number;
    totalPages: number;
    total: number;
    pageSize: number;
  };

  const uploads = (data.uploads ?? []).map((row) => normalizeUploadPageRow(row));

  return {
    uploads,
    currentPage: data.currentPage,
    totalPages: data.totalPages,
    total: data.total,
    pageSize: data.pageSize,
  };
}

export function normalizeUploadRecord(raw: Record<string, unknown>): UploadImage {
  return {
    _id: String(raw._id ?? ''),
    blockCode: String(raw.blockCode ?? ''),
    fileName: String(raw.fileName ?? ''),
    url: String(raw.url ?? ''),
    tag: raw.tag != null ? String(raw.tag) : undefined,
    halkaName: String(raw.halkaName ?? ''),
    gender: String(raw.gender ?? ''),
    religion: String(raw.religion ?? ''),
    status: String(raw.status ?? ''),
    uploadedAt:
      raw.uploadedAt instanceof Date
        ? raw.uploadedAt.toISOString()
        : String(raw.uploadedAt ?? ''),
  };
}

export async function fetchUploadsPage(
  query: UploadListQuery,
  page: number,
  limit: number,
  handlers: {
    onMeta?: (meta: UploadPageMeta) => void;
    onPreviewReady?: (uploads: UploadImage[]) => void;
    onUpload?: (upload: UploadImage) => void;
    onUploadsUpdate?: (uploads: UploadImage[]) => void;
    onProgress?: (loaded: number, expected: number) => void;
    onDone?: (result: UploadPageResult) => void;
    onError?: (message: string) => void;
  }
): Promise<UploadPageResult> {
  const params = buildUploadListQueryString(query, page, limit, { stream: true });
  const response = await fetch(`/api/blockcodes/?${params}`);

  if (!response.ok) {
    let message = `Failed to load uploads (HTTP ${response.status})`;
    try {
      const data = (await response.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // ignore parse errors for non-json error bodies
    }
    handlers.onError?.(message);
    throw new Error(message);
  }

  if (!response.body) {
    throw new Error('Streaming is not supported in this browser');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let meta: UploadPageMeta | null = null;
  const uploads: UploadImage[] = [];
  const streamState = {
    doneMeta: null as Omit<UploadPageResult, 'uploads'> | null,
  };
  let previewReady = false;
  let pendingBatch: UploadImage[] = [];
  let flushScheduled = false;
  let expectedCount = limit;

  const flushBatch = () => {
    flushScheduled = false;
    if (!pendingBatch.length) return;

    for (const upload of pendingBatch) {
      uploads.push(upload);
    }
    pendingBatch = [];
    handlers.onUploadsUpdate?.([...uploads]);
    handlers.onProgress?.(uploads.length, expectedCount);
  };

  const scheduleBatchFlush = () => {
    if (flushScheduled) return;
    flushScheduled = true;
    requestAnimationFrame(flushBatch);
  };

  const deliverUpload = (upload: UploadImage) => {
    if (!previewReady) {
      uploads.push(upload);
      handlers.onUpload?.(upload);
      handlers.onProgress?.(uploads.length, expectedCount);

      if (uploads.length >= Math.min(UPLOAD_PREVIEW_COUNT, expectedCount)) {
        previewReady = true;
        handlers.onPreviewReady?.([...uploads]);
      }
      return;
    }

    pendingBatch.push(upload);
    if (pendingBatch.length >= UPLOAD_STREAM_BATCH_SIZE) {
      flushBatch();
    } else {
      scheduleBatchFlush();
    }
  };

  const handleLine = (line: string) => {
    if (!line.trim()) return;

    const event = JSON.parse(line) as UploadStreamEvent;
    if (event.type === 'meta') {
      meta = { currentPage: event.currentPage, pageSize: event.pageSize };
      expectedCount = event.pageSize;
      handlers.onMeta?.(meta);
      return;
    }

    if (event.type === 'preview') {
      if (!previewReady && uploads.length > 0) {
        previewReady = true;
        handlers.onPreviewReady?.([...uploads]);
      }
      return;
    }

    if (event.type === 'upload') {
      deliverUpload(normalizeUploadRecord(event.upload as unknown as Record<string, unknown>));
      return;
    }

    if (event.type === 'done') {
      flushBatch();
      streamState.doneMeta = {
        currentPage: event.currentPage,
        pageSize: event.pageSize,
        total: event.total,
        totalPages: event.totalPages,
      };
      meta = { currentPage: event.currentPage, pageSize: event.pageSize };
      handlers.onProgress?.(uploads.length, event.pageSize);
      handlers.onDone?.({ ...streamState.doneMeta, uploads });
      return;
    }

    if (event.type === 'error') {
      handlers.onError?.(event.error);
      throw new Error(event.error);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      handleLine(line);
    }
  }

  if (buffer.trim()) {
    handleLine(buffer);
  }

  flushBatch();

  if (!streamState.doneMeta) {
    throw new Error('Upload stream ended before completion');
  }

  return {
    currentPage: streamState.doneMeta.currentPage,
    pageSize: streamState.doneMeta.pageSize,
    total: streamState.doneMeta.total,
    totalPages: streamState.doneMeta.totalPages,
    uploads,
  };
}
