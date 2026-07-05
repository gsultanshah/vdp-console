'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  DocumentArrowDownIcon,
  ShieldExclamationIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { Progress } from '@/components/ui/progress';
import type { BlockCodeContext } from '@/lib/blockcode-hub';
import {
  DEFAULT_EXPORT_FIELD_IDS,
  EXPORT_FIELD_DEFINITIONS,
  EXPORT_FILE_SIZE_UI_MB,
  type ExportFormat,
} from '@/lib/export-fields';
import { exportJobFiles, exportStatusLabel, formatExportBytes } from '@/lib/voter-export-ui';
import { useVoterExport } from '@/hooks/useVoterExport';

interface BlockCodeExportTabProps {
  context: BlockCodeContext;
}

type ExportPreset = 'custom' | 'standard';

export default function BlockCodeExportTab({ context }: BlockCodeExportTabProps) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectedFields, setSelectedFields] = useState<string[]>([...DEFAULT_EXPORT_FIELD_IDS]);
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [preset, setPreset] = useState<ExportPreset>('custom');
  const [includeTableColumns, setIncludeTableColumns] = useState(false);
  const [fieldSearch, setFieldSearch] = useState('');
  const [voterCount, setVoterCount] = useState<number | null>(null);

  const {
    activeJob,
    previousJobs,
    isStarting,
    isProcessing,
    loadPreviousJobs,
    downloadFile,
    startExport,
    resumeJob,
    stopPolling,
  } = useVoterExport({
    blockCodeFilter: context.blockCode,
    autoDownloadOnComplete: true,
  });

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) {
      return;
    }
    try {
      const user = JSON.parse(userStr) as { role?: string };
      setIsAdmin(user.role === 'admin');
    } catch {
      setIsAdmin(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }
    void loadPreviousJobs();
  }, [isAdmin, loadPreviousJobs]);

  useEffect(() => {
    const fetchCount = async () => {
      try {
        const params = new URLSearchParams({
          blockCode: context.blockCode,
          halkaName: context.halkaName,
          limit: '1',
        });
        const response = await fetch(`/api/voters/?${params.toString()}`);
        if (!response.ok) {
          return;
        }
        const data = await response.json();
        setVoterCount(typeof data.total === 'number' ? data.total : null);
      } catch {
        // ignore count errors
      }
    };
    void fetchCount();
  }, [context.blockCode, context.halkaName]);

  const filteredFields = useMemo(() => {
    const query = fieldSearch.trim().toLowerCase();
    if (!query) {
      return EXPORT_FIELD_DEFINITIONS;
    }
    return EXPORT_FIELD_DEFINITIONS.filter(
      (field) => field.label.toLowerCase().includes(query) || field.id.toLowerCase().includes(query)
    );
  }, [fieldSearch]);

  const toggleField = (fieldId: string) => {
    setSelectedFields((current) =>
      current.includes(fieldId) ? current.filter((field) => field !== fieldId) : [...current, fieldId]
    );
  };

  const selectAllFields = () => setSelectedFields(EXPORT_FIELD_DEFINITIONS.map((field) => field.id));
  const selectDefaultFields = () => setSelectedFields([...DEFAULT_EXPORT_FIELD_IDS]);
  const clearFields = () => setSelectedFields([]);

  const handleStartExport = useCallback(async () => {
    if (preset === 'custom' && !selectedFields.length) {
      toast.error('Select at least one column');
      return;
    }

    await startExport({
      halkaNames: [context.halkaName],
      blockCodes: [context.blockCode],
      fields: preset === 'standard' ? [...DEFAULT_EXPORT_FIELD_IDS] : selectedFields,
      includeTableColumns: preset === 'custom' && includeTableColumns,
      format,
      mode: preset === 'standard' ? 'default_per_blockcode' : 'custom',
      splitLargeFiles: true,
    });
  }, [context.blockCode, context.halkaName, format, includeTableColumns, preset, selectedFields, startExport]);

  if (!isAdmin) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-8 text-center">
        <ShieldExclamationIcon className="mx-auto h-10 w-10 text-amber-600" />
        <h3 className="mt-3 text-lg font-medium text-amber-900">Admin access required</h3>
        <p className="mt-2 text-sm text-amber-800">
          Voter exports are restricted to administrators. Contact an admin to export data for this block.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Export voters</h3>
            <p className="mt-1 text-sm text-gray-600">
              Export block <span className="font-mono font-medium">{context.blockCode}</span> as CSV or XLSX.
              Large exports are processed in batches and automatically split into multiple files at{' '}
              {EXPORT_FILE_SIZE_UI_MB} MB per file.
            </p>
          </div>
          {voterCount !== null && (
            <div className="rounded-lg bg-white px-4 py-2 text-sm shadow-sm ring-1 ring-gray-200">
              <span className="text-gray-500">Estimated records:</span>{' '}
              <span className="font-semibold text-gray-900">{voterCount.toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-5 rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <div>
            <label htmlFor="export-preset" className="block text-sm font-medium text-gray-700">
              Export type
            </label>
            <select
              id="export-preset"
              value={preset}
              onChange={(e) => setPreset(e.target.value as ExportPreset)}
              className="mt-1 block w-full rounded-lg border-0 py-2.5 px-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
            >
              <option value="custom">Custom columns (single export, auto-split)</option>
              <option value="standard">Standard (name, CNIC, phone)</option>
            </select>
          </div>

          <div>
            <label htmlFor="export-format" className="block text-sm font-medium text-gray-700">
              File format
            </label>
            <select
              id="export-format"
              value={format}
              onChange={(e) => setFormat(e.target.value as ExportFormat)}
              className="mt-1 block w-full rounded-lg border-0 py-2.5 px-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
            >
              <option value="csv">CSV</option>
              <option value="xlsx">XLSX (Excel)</option>
            </select>
          </div>

          {preset === 'custom' && format === 'xlsx' && (
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={includeTableColumns}
                onChange={(e) => setIncludeTableColumns(e.target.checked)}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
              />
              Include constituency table columns in export
            </label>
          )}

          {preset === 'custom' && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-medium text-gray-900">Columns</h4>
                <div className="flex flex-wrap gap-2 text-xs">
                  <button type="button" onClick={selectAllFields} className="text-indigo-600 hover:text-indigo-800">
                    Select all
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    type="button"
                    onClick={selectDefaultFields}
                    className="text-indigo-600 hover:text-indigo-800"
                  >
                    Defaults
                  </button>
                  <span className="text-gray-300">|</span>
                  <button type="button" onClick={clearFields} className="text-gray-500 hover:text-gray-700">
                    Clear
                  </button>
                </div>
              </div>

              <input
                type="text"
                value={fieldSearch}
                onChange={(e) => setFieldSearch(e.target.value)}
                placeholder="Filter columns..."
                className="mt-2 block w-full rounded-lg border-0 py-2 px-3 text-sm text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600"
              />

              <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-gray-200 p-2">
                <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {filteredFields.map((field) => (
                    <label
                      key={field.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedFields.includes(field.id)}
                        onChange={() => toggleField(field.id)}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
                      />
                      {field.label}
                    </label>
                  ))}
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-500">{selectedFields.length} column(s) selected</p>
            </div>
          )}

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              disabled={isStarting || isProcessing}
              onClick={() => void handleStartExport()}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <DocumentArrowDownIcon className="h-4 w-4" />
              {isStarting ? 'Starting...' : isProcessing ? 'Exporting...' : 'Start export'}
            </button>
            {isProcessing && (
              <button
                type="button"
                onClick={stopPolling}
                className="rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
              >
                Stop polling
              </button>
            )}
          </div>
        </div>

        <div className="space-y-5">
          {activeJob && (
            <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-medium text-gray-900">Current export</h4>
                  <p className="text-xs text-gray-500">{exportStatusLabel(activeJob.status)}</p>
                </div>
                <span className="text-sm font-medium text-gray-700">
                  {activeJob.processedVoters.toLocaleString()} / {activeJob.totalVoters.toLocaleString()}
                </span>
              </div>

              <Progress value={activeJob.progressPercent} className="mt-4 h-2.5" />
              <p className="mt-2 text-xs text-gray-600">{activeJob.progressPercent}% complete</p>

              {activeJob.error && (
                <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{activeJob.error}</div>
              )}

              {exportJobFiles(activeJob).length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Files</p>
                  {exportJobFiles(activeJob).map((file) => (
                    <div
                      key={file.fileName}
                      className="flex items-center justify-between gap-3 rounded-md border border-gray-100 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-900">{file.fileName}</p>
                        <p className="text-xs text-gray-500">
                          {file.rowCount.toLocaleString()} rows
                          {file.sizeBytes > 0 ? ` · ${formatExportBytes(file.sizeBytes)}` : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void downloadFile(activeJob._id, file.fileName)}
                        className="shrink-0 rounded-md bg-indigo-600 p-2 text-white hover:bg-indigo-500"
                        title="Download"
                      >
                        <ArrowDownTrayIcon className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-medium text-gray-900">Previous exports</h4>
              <button
                type="button"
                onClick={() => void loadPreviousJobs()}
                className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
              >
                <ArrowPathIcon className="h-3.5 w-3.5" />
                Refresh
              </button>
            </div>

            {previousJobs.length === 0 ? (
              <p className="mt-4 text-sm text-gray-500">No previous exports for this block.</p>
            ) : (
              <ul className="mt-4 divide-y divide-gray-100">
                {previousJobs.map((job) => {
                  const files = exportJobFiles(job);
                  return (
                    <li key={job._id} className="py-3 first:pt-0">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {exportStatusLabel(job.status)} · {job.format.toUpperCase()}
                          </p>
                          <p className="text-xs text-gray-500">
                            {new Date(job.createdAt).toLocaleString()} · {job.processedVoters.toLocaleString()} /{' '}
                            {job.totalVoters.toLocaleString()} rows
                            {files.length > 1 ? ` · ${files.length} files` : ''}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {job.resumable && job.status !== 'completed' && (
                            <button
                              type="button"
                              onClick={() => void resumeJob(job)}
                              disabled={isProcessing}
                              className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50"
                            >
                              Resume
                            </button>
                          )}
                          {job.status === 'completed' && files.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                for (const file of files) {
                                  void downloadFile(job._id, file.fileName);
                                }
                              }}
                              className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
                            >
                              Download{files.length > 1 ? ` (${files.length})` : ''}
                            </button>
                          )}
                        </div>
                      </div>
                      {job.error && <p className="mt-1 text-xs text-red-600">{job.error}</p>}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
