import type {
  VoterBrowseQueryParams,
  VoterBrowseRecord,
  VoterPageMeta,
  VoterPageResult,
  VoterStreamEvent,
} from '@/lib/voter-browse-types';

export const VOTER_LIST_PROJECTION = {
  _id: 1,
  cnic: 1,
  name: 1,
  blockCode: 1,
  silsilaNo: 1,
  gharanaNo: 1,
  fatherName: 1,
  halkaName: 1,
  row: 1,
} as const;

export const VOTER_SPREADSHEET_PROJECTION = {
  ...VOTER_LIST_PROJECTION,
  profession: 1,
  age: 1,
  address: 1,
  cells: 1,
  reproduction: 1,
  imageUrl: 1,
  fileName: 1,
} as const;

export const DEFAULT_VOTER_PAGE_SIZE = 50;
export const MAX_VOTER_PAGE_SIZE = 100;
export const VOTER_PREVIEW_COUNT = 5;
export const VOTER_STREAM_BATCH_SIZE = 5;

export function buildVoterListQueryString(
  query: VoterBrowseQueryParams,
  page: number,
  limit: number,
  options?: { stream?: boolean; lite?: boolean }
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
  if (options?.lite !== false) {
    params.set('lite', 'true');
  }
  if (options?.stream) {
    params.set('stream', 'true');
  }
  return params.toString();
}

export function normalizeVoterBrowseRecord(raw: Record<string, unknown>): VoterBrowseRecord {
  return {
    _id: String(raw._id ?? ''),
    cnic: String(raw.cnic ?? ''),
    halkaName: String(raw.halkaName ?? ''),
    blockCode: String(raw.blockCode ?? ''),
    silsilaNo: String(raw.silsilaNo ?? ''),
    gharanaNo: String(raw.gharanaNo ?? ''),
    name: String(raw.name ?? ''),
    row: typeof raw.row === 'number' ? raw.row : undefined,
    rowY: typeof raw.rowY === 'number' ? raw.rowY : undefined,
    rowHeight: typeof raw.rowHeight === 'number' ? raw.rowHeight : undefined,
    imageUrl: raw.imageUrl != null ? String(raw.imageUrl) : undefined,
    gender: raw.gender != null ? String(raw.gender) : undefined,
    religion: raw.religion != null ? String(raw.religion) : undefined,
    pageTag: raw.pageTag != null ? String(raw.pageTag) : undefined,
    fileName: raw.fileName != null ? String(raw.fileName) : undefined,
    fatherName: raw.fatherName != null ? String(raw.fatherName) : undefined,
    profession: raw.profession != null ? String(raw.profession) : undefined,
    age: raw.age != null ? String(raw.age) : null,
    address: raw.address != null ? String(raw.address) : null,
    previousAddress: raw.previousAddress != null ? String(raw.previousAddress) : undefined,
    cells: Array.isArray(raw.cells) ? (raw.cells as VoterBrowseRecord['cells']) : undefined,
    reproduction: raw.reproduction as VoterBrowseRecord['reproduction'],
    createdAt:
      raw.createdAt instanceof Date
        ? raw.createdAt.toISOString()
        : raw.createdAt != null
          ? String(raw.createdAt)
          : undefined,
    updatedAt:
      raw.updatedAt instanceof Date
        ? raw.updatedAt.toISOString()
        : raw.updatedAt != null
          ? String(raw.updatedAt)
          : undefined,
  };
}

export async function fetchVotersPage(
  query: VoterBrowseQueryParams,
  page: number,
  limit: number,
  handlers: {
    onMeta?: (meta: VoterPageMeta) => void;
    onPreviewReady?: (voters: VoterBrowseRecord[]) => void;
    onVoter?: (voter: VoterBrowseRecord) => void;
    onVotersUpdate?: (voters: VoterBrowseRecord[]) => void;
    onProgress?: (loaded: number, expected: number) => void;
    onDone?: (result: VoterPageResult) => void;
    onError?: (message: string) => void;
  },
  signal?: AbortSignal
): Promise<VoterPageResult> {
  const params = buildVoterListQueryString(query, page, limit, { stream: true, lite: true });
  const response = await fetch(`/api/voters/?${params}`, { signal });

  if (!response.ok) {
    let message = `Failed to load voters (HTTP ${response.status})`;
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
  let meta: VoterPageMeta | null = null;
  const voters: VoterBrowseRecord[] = [];
  const streamState = {
    doneMeta: null as Omit<VoterPageResult, 'voters'> | null,
  };
  let previewReady = false;
  let pendingBatch: VoterBrowseRecord[] = [];
  let flushScheduled = false;
  let expectedCount = limit;

  const flushBatch = () => {
    flushScheduled = false;
    if (!pendingBatch.length) return;

    for (const voter of pendingBatch) {
      voters.push(voter);
    }
    pendingBatch = [];
    handlers.onVotersUpdate?.([...voters]);
    handlers.onProgress?.(voters.length, expectedCount);
  };

  const scheduleBatchFlush = () => {
    if (flushScheduled) return;
    flushScheduled = true;
    requestAnimationFrame(flushBatch);
  };

  const deliverVoter = (voter: VoterBrowseRecord) => {
    if (!previewReady) {
      voters.push(voter);
      handlers.onVoter?.(voter);
      handlers.onProgress?.(voters.length, expectedCount);

      if (voters.length >= Math.min(VOTER_PREVIEW_COUNT, expectedCount)) {
        previewReady = true;
        handlers.onPreviewReady?.([...voters]);
      }
      return;
    }

    pendingBatch.push(voter);
    if (pendingBatch.length >= VOTER_STREAM_BATCH_SIZE) {
      flushBatch();
    } else {
      scheduleBatchFlush();
    }
  };

  const handleLine = (line: string) => {
    if (!line.trim()) return;

    const event = JSON.parse(line) as VoterStreamEvent;
    if (event.type === 'meta') {
      meta = { currentPage: event.currentPage, pageSize: event.pageSize };
      expectedCount = event.pageSize;
      handlers.onMeta?.(meta);
      return;
    }

    if (event.type === 'preview') {
      if (!previewReady && voters.length > 0) {
        previewReady = true;
        handlers.onPreviewReady?.([...voters]);
      }
      return;
    }

    if (event.type === 'voter') {
      deliverVoter(normalizeVoterBrowseRecord(event.voter as unknown as Record<string, unknown>));
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
      handlers.onProgress?.(voters.length, event.pageSize);
      handlers.onDone?.({ ...streamState.doneMeta, voters });
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
    throw new Error('Voter stream ended before completion');
  }

  return {
    currentPage: streamState.doneMeta.currentPage,
    pageSize: streamState.doneMeta.pageSize,
    total: streamState.doneMeta.total,
    totalPages: streamState.doneMeta.totalPages,
    voters,
  };
}
