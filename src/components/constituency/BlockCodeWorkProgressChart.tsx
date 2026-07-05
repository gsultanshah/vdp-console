'use client';

import { ClipboardDocumentCheckIcon } from '@heroicons/react/24/outline';
import {
  BLOCK_WORK_STATUSES,
  BLOCK_WORK_STATUS_COLORS,
  BLOCK_WORK_STATUS_LABELS,
  BLOCK_WORK_STATUS_BADGE,
  type BlockWorkProgressSummary,
  type BlockWorkStatus,
} from '@/lib/block-work-progress';

function formatNumber(value: number): string {
  return value.toLocaleString();
}

function GradientProgress({ value, barClass }: { value: number; barClass: string }) {
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className={`h-full rounded-full bg-gradient-to-r transition-all duration-700 ease-out ${barClass}`}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

interface BlockCodeWorkProgressChartProps {
  summary: BlockWorkProgressSummary | null;
  loading?: boolean;
}

export default function BlockCodeWorkProgressChart({
  summary,
  loading,
}: BlockCodeWorkProgressChartProps) {
  const rows = summary
    ? BLOCK_WORK_STATUSES.map((status) => ({
        label: BLOCK_WORK_STATUS_LABELS[status],
        value: summary.byStatus[status],
        color: BLOCK_WORK_STATUS_COLORS[status],
      })).filter((row) => row.value > 0)
    : [];

  const max = Math.max(...rows.map((row) => row.value), 1);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-gradient-to-br from-violet-50 to-indigo-50 blur-2xl" />
      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <ClipboardDocumentCheckIcon className="h-5 w-5 text-violet-600" />
            <div>
              <h3 className="font-bold text-slate-900">Manual work progress</h3>
              <p className="text-xs text-slate-500">Block code status tracking</p>
            </div>
          </div>
          {!loading && summary ? (
            <div className="text-right">
              <p className="text-2xl font-bold text-slate-900">{summary.completionPercent}%</p>
              <p className="text-xs text-slate-500">completed + verified</p>
            </div>
          ) : null}
        </div>

        {!loading && summary ? (
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-xs text-slate-500">
              <span>
                {formatNumber(summary.byStatus.completed + summary.byStatus.verified)} of{' '}
                {formatNumber(summary.total)} blocks done
              </span>
              <span>{formatNumber(summary.byStatus.processing)} processing</span>
            </div>
            <GradientProgress
              value={summary.completionPercent}
              barClass="from-emerald-500 to-teal-500"
            />
          </div>
        ) : null}

        <div className="mt-5 space-y-4">
          {loading
            ? Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="animate-pulse">
                  <div className="mb-2 h-3 w-24 rounded bg-slate-200" />
                  <div className="h-2.5 rounded-full bg-slate-100" />
                </div>
              ))
            : rows.length > 0
              ? rows.map((row) => (
                  <div key={row.label}>
                    <div className="mb-1.5 flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-600">{row.label}</span>
                      <span className="font-bold text-slate-900">{formatNumber(row.value)}</span>
                    </div>
                    <GradientProgress
                      value={Math.round((row.value / max) * 100)}
                      barClass={row.color}
                    />
                  </div>
                ))
              : (
                  <p className="text-sm text-slate-500">No block codes in this constituency yet.</p>
                )}
        </div>
      </div>
    </div>
  );
}

export function BlockWorkStatusBadge({ status }: { status: BlockWorkStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${BLOCK_WORK_STATUS_BADGE[status]}`}
    >
      {BLOCK_WORK_STATUS_LABELS[status]}
    </span>
  );
}
