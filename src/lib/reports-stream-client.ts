import type {
  ReportsBlockStreamEvent,
  ReportsConstituencyRow,
  ReportsStreamEvent,
} from '@/lib/reports-types';
import { parseNdjsonStream } from '@/lib/ndjson-stream';

export interface ReportsStreamHandlers {
  onMeta?: (event: Extract<ReportsStreamEvent, { type: 'meta' }>) => void;
  onSummary?: (event: Extract<ReportsStreamEvent, { type: 'summary' }>) => void;
  onVoters?: (event: Extract<ReportsStreamEvent, { type: 'voters' }>) => void;
  onConstituency?: (row: ReportsConstituencyRow) => void;
  onProgress?: (event: Extract<ReportsStreamEvent, { type: 'progress' }>) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
}

export async function streamReportsOverview(
  handlers: ReportsStreamHandlers,
  options?: { halkaName?: string; signal?: AbortSignal }
): Promise<void> {
  const params = new URLSearchParams();
  if (options?.halkaName) {
    params.set('halkaName', options.halkaName);
  }

  const url =
    params.size > 0 ? `/api/reports/stream/?${params.toString()}` : '/api/reports/stream/';

  const response = await fetch(url, { signal: options?.signal });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || 'Failed to load reports');
  }

  await parseNdjsonStream<ReportsStreamEvent>(
    response,
    (event) => {
      switch (event.type) {
        case 'meta':
          handlers.onMeta?.(event);
          break;
        case 'summary':
          handlers.onSummary?.(event);
          break;
        case 'voters':
          handlers.onVoters?.(event);
          break;
        case 'constituency':
          handlers.onConstituency?.(event.row);
          break;
        case 'progress':
          handlers.onProgress?.(event);
          break;
        case 'done':
          handlers.onDone?.();
          break;
        case 'error':
          handlers.onError?.(event.error);
          break;
        default:
          break;
      }
    },
    options?.signal
  );
}

export interface ReportsBlockStreamHandlers {
  onMeta?: (event: Extract<ReportsBlockStreamEvent, { type: 'meta' }>) => void;
  onBlockCode?: (event: Extract<ReportsBlockStreamEvent, { type: 'blockCode' }>) => void;
  onProgress?: (event: Extract<ReportsBlockStreamEvent, { type: 'progress' }>) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
}

export async function streamReportsBlockCodes(
  handlers: ReportsBlockStreamHandlers,
  options?: { halkaName?: string; signal?: AbortSignal }
): Promise<void> {
  const params = new URLSearchParams();
  if (options?.halkaName) {
    params.set('halkaName', options.halkaName);
  }

  const url =
    params.size > 0
      ? `/api/reports/blocks/stream/?${params.toString()}`
      : '/api/reports/blocks/stream/';

  const response = await fetch(url, { signal: options?.signal });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || 'Failed to load block reports');
  }

  await parseNdjsonStream<ReportsBlockStreamEvent>(
    response,
    (event) => {
      switch (event.type) {
        case 'meta':
          handlers.onMeta?.(event);
          break;
        case 'blockCode':
          handlers.onBlockCode?.(event);
          break;
        case 'progress':
          handlers.onProgress?.(event);
          break;
        case 'done':
          handlers.onDone?.();
          break;
        case 'error':
          handlers.onError?.(event.error);
          break;
        default:
          break;
      }
    },
    options?.signal
  );
}
