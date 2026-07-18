export const BLOCK_WORK_STATUSES = [
  'pending',
  'processing',
  'completed',
  'verified',
  'invalid',
  'incomplete',
] as const;

export type BlockWorkStatus = (typeof BLOCK_WORK_STATUSES)[number];

export interface BlockWorkProgressUser {
  userId?: string;
  email: string;
  name?: string;
}

export interface BlockWorkProgressHistoryEntry {
  status: BlockWorkStatus;
  comments?: string;
  changedAt: string;
  changedBy: BlockWorkProgressUser;
}

export interface BlockWorkProgressRecord {
  blockCode: string;
  halkaName: string;
  status: BlockWorkStatus;
  comments: string;
  requestParchiGeneration?: boolean;
  updatedAt: string;
  updatedBy?: BlockWorkProgressUser;
  history: BlockWorkProgressHistoryEntry[];
}

export interface BlockWorkProgressSummary {
  total: number;
  byStatus: Record<BlockWorkStatus, number>;
  completionPercent: number;
}

export interface BlockWorkProgressResponse {
  halkaName: string;
  blockCodes: string[];
  records: Record<string, BlockWorkProgressRecord>;
  summary: BlockWorkProgressSummary;
}

export const BLOCK_WORK_STATUS_LABELS: Record<BlockWorkStatus, string> = {
  pending: 'Pending',
  processing: 'Processing',
  completed: 'Completed',
  verified: 'Verified',
  invalid: 'Invalid',
  incomplete: 'Incomplete',
};

export const BLOCK_WORK_STATUS_COLORS: Record<BlockWorkStatus, string> = {
  pending: 'from-slate-400 to-slate-500',
  processing: 'from-amber-500 to-orange-500',
  completed: 'from-emerald-500 to-teal-500',
  verified: 'from-sky-500 to-cyan-500',
  invalid: 'from-rose-500 to-red-500',
  incomplete: 'from-orange-500 to-amber-600',
};

export const BLOCK_WORK_STATUS_BADGE: Record<BlockWorkStatus, string> = {
  pending: 'bg-slate-100 text-slate-700 ring-slate-200',
  processing: 'bg-amber-100 text-amber-900 ring-amber-200',
  completed: 'bg-emerald-100 text-emerald-900 ring-emerald-200',
  verified: 'bg-sky-100 text-sky-900 ring-sky-200',
  invalid: 'bg-rose-100 text-rose-900 ring-rose-200',
  incomplete: 'bg-orange-100 text-orange-900 ring-orange-200',
};

export function emptyStatusCounts(): Record<BlockWorkStatus, number> {
  return {
    pending: 0,
    processing: 0,
    completed: 0,
    verified: 0,
    invalid: 0,
    incomplete: 0,
  };
}

export function buildWorkProgressSummary(
  blockCodes: string[],
  records: Record<string, BlockWorkProgressRecord>
): BlockWorkProgressSummary {
  const byStatus = emptyStatusCounts();
  const total = blockCodes.length;

  for (const code of blockCodes) {
    const status = records[code]?.status ?? 'pending';
    byStatus[status] += 1;
  }

  const doneCount = byStatus.completed + byStatus.verified;
  const completionPercent = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  return { total, byStatus, completionPercent };
}

export function isBlockWorkStatus(value: string): value is BlockWorkStatus {
  return (BLOCK_WORK_STATUSES as readonly string[]).includes(value);
}

export async function fetchBlockWorkProgress(halkaName: string): Promise<BlockWorkProgressResponse> {
  const response = await fetch(
    `/api/constituency/block-work-progress/?halkaName=${encodeURIComponent(halkaName)}`
  );
  const data = (await response.json().catch(() => ({}))) as BlockWorkProgressResponse & { error?: string };

  if (!response.ok) {
    throw new Error(data.error || 'Failed to load work progress');
  }

  return data;
}

export async function saveBlockWorkProgress(payload: {
  halkaName: string;
  blockCode: string;
  status: BlockWorkStatus;
  comments: string;
  requestParchiGeneration?: boolean;
}): Promise<BlockWorkProgressRecord> {
  const response = await fetch('/api/constituency/block-work-progress/', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = (await response.json().catch(() => ({}))) as BlockWorkProgressRecord & { error?: string };

  if (!response.ok) {
    throw new Error(data.error || 'Failed to save work progress');
  }

  return data;
}
