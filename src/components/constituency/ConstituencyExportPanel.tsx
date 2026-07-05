'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  DocumentArrowDownIcon,
  ShieldExclamationIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { Progress } from '@/components/ui/progress';
import { DEFAULT_EXPORT_FIELD_IDS, type ExportFormat } from '@/lib/export-fields';
import { exportJobFiles, exportStatusLabel, formatExportBytes } from '@/lib/voter-export-ui';
import { useVoterExport } from '@/hooks/useVoterExport';

interface ConstituencyExportPanelProps {
  halkaName: string;
  voterCount?: number | null;
}

export default function ConstituencyExportPanel({ halkaName, voterCount }: ConstituencyExportPanelProps) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [format, setFormat] = useState<ExportFormat>('csv');

  const {
    activeJob,
    previousJobs,
    isStarting,
    isProcessing,
    loadPreviousJobs,
    downloadFile,
    startExport,
    resumeJob,
  } = useVoterExport({ autoDownloadOnComplete: true });

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) return;
    try {
      const user = JSON.parse(userStr) as { role?: string };
      setIsAdmin(user.role === 'admin');
    } catch {
      setIsAdmin(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      void loadPreviousJobs();
    }
  }, [isAdmin, loadPreviousJobs]);

  const handleStartExport = useCallback(async () => {
    await startExport({
      halkaNames: [halkaName],
      blockCodes: [],
      selectAllBlockCodes: true,
      fields: [...DEFAULT_EXPORT_FIELD_IDS],
      format,
      mode: 'custom',
      splitLargeFiles: true,
    });
  }, [format, halkaName, startExport]);

  if (!isAdmin) {
    return (
      <div className="rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50 to-orange-50 p-5">
        <div className="flex items-start gap-3">
          <ShieldExclamationIcon className="h-6 w-6 shrink-0 text-amber-600" />
          <div>
            <p className="font-semibold text-amber-900">Export requires admin access</p>
            <p className="mt-1 text-sm text-amber-800">
              Contact an administrator to export voter data for {halkaName}.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const recentJobs = previousJobs.filter((job) => job.halkaNames.includes(halkaName)).slice(0, 3);

  return (
    <div className="rounded-2xl border border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-900">Export voters</h3>
          <p className="mt-1 text-sm text-slate-600">
            Download all voters in {halkaName}
            {voterCount != null && (
              <span className="font-medium text-violet-700"> · {voterCount.toLocaleString()} records</span>
            )}
          </p>
        </div>
        <button
          onClick={() => void loadPreviousJobs()}
          disabled={isProcessing}
          className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 bg-white px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50"
        >
          <ArrowPathIcon className={`h-3.5 w-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Format</label>
          <select
            value={format}
            onChange={(event) => setFormat(event.target.value as ExportFormat)}
            disabled={isStarting || isProcessing}
            className="mt-1 block rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800"
          >
            <option value="csv">CSV</option>
            <option value="xlsx">XLSX</option>
          </select>
        </div>
        <button
          onClick={() => void handleStartExport()}
          disabled={isStarting || isProcessing}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-violet-200 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ArrowDownTrayIcon className="h-4 w-4" />
          {isStarting ? 'Starting…' : 'Start export'}
        </button>
      </div>

      {activeJob && (
        <div className="mt-4 rounded-xl border border-violet-100 bg-white/80 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-slate-900">{exportStatusLabel(activeJob.status)}</span>
            <span className="text-slate-500">{activeJob.progressPercent}%</span>
          </div>
          <Progress value={activeJob.progressPercent} className="mt-2 h-2" />
          <p className="mt-2 text-xs text-slate-500">
            {activeJob.processedVoters.toLocaleString()} / {activeJob.totalVoters.toLocaleString()} voters
          </p>
          {activeJob.resumable && activeJob.status === 'failed' && (
            <button
              onClick={() => void resumeJob(activeJob)}
              className="mt-3 text-sm font-semibold text-violet-700 hover:text-violet-900"
            >
              Resume export
            </button>
          )}
          {activeJob.status === 'completed' && exportJobFiles(activeJob).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {exportJobFiles(activeJob).map((file) => (
                <button
                  key={file.fileName}
                  onClick={() => void downloadFile(activeJob._id, file.fileName)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-800 hover:bg-violet-100"
                >
                  <DocumentArrowDownIcon className="h-3.5 w-3.5" />
                  {file.fileName}
                  <span className="text-violet-500">({formatExportBytes(file.sizeBytes)})</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {recentJobs.length > 0 && !activeJob && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recent exports</p>
          <ul className="mt-2 space-y-2">
            {recentJobs.map((job) => (
              <li
                key={job._id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/70 px-3 py-2 text-sm"
              >
                <span className="font-medium text-slate-700">{exportStatusLabel(job.status)}</span>
                <span className="text-xs text-slate-500">
                  {new Date(job.createdAt).toLocaleString()}
                </span>
                {job.status === 'completed' && exportJobFiles(job).length > 0 && (
                  <button
                    onClick={() => void downloadFile(job._id, exportJobFiles(job)[0].fileName)}
                    className="text-xs font-semibold text-violet-700 hover:text-violet-900"
                  >
                    Download
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
