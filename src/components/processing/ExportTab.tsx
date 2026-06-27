'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Progress } from '@/components/ui/progress';
import ExportGuidePanel from '@/components/processing/ExportGuidePanel';
import {
  DEFAULT_EXPORT_FIELD_IDS,
  EXPORT_FIELD_DEFINITIONS,
  EXPORT_FILE_SIZE_UI_MB,
  type ExportFormat,
  type ExportMode,
} from '@/lib/export-fields';

interface ConstituencyOption {
  _id: string;
  halkaName: string;
  blockCodes: string[];
}

interface OutputFile {
  blockCode: string | null;
  halkaName: string | null;
  fileName: string;
  sizeBytes: number;
  rowCount: number;
}

interface ExportJob {
  _id: string;
  status: string;
  halkaNames: string[];
  blockCodes: string[];
  fields: string[];
  format: ExportFormat;
  mode: ExportMode;
  totalVoters: number;
  processedVoters: number;
  progressPercent: number;
  currentBlockCode: string | null;
  outputFiles: OutputFile[];
  combinedFileName: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  resumable: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function statusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'running':
      return 'Running';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    case 'cancelled':
      return 'Cancelled';
    case 'size_exceeded':
      return 'Size limit exceeded';
    default:
      return status;
  }
}

export default function ExportTab() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [constituencies, setConstituencies] = useState<ConstituencyOption[]>([]);
  const [isLoadingConstituencies, setIsLoadingConstituencies] = useState(true);
  const [selectedHalkas, setSelectedHalkas] = useState<string[]>([]);
  const [selectedBlockCodes, setSelectedBlockCodes] = useState<string[]>([]);
  const [selectAllBlockCodes, setSelectAllBlockCodes] = useState(false);
  const [blockCodeSearch, setBlockCodeSearch] = useState('');
  const [selectedFields, setSelectedFields] = useState<string[]>([...DEFAULT_EXPORT_FIELD_IDS]);
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [mode, setMode] = useState<ExportMode>('custom');
  const [activeJob, setActiveJob] = useState<ExportJob | null>(null);
  const [previousJobs, setPreviousJobs] = useState<ExportJob[]>([]);
  const [isStarting, setIsStarting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const abortRef = useRef(false);

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

  const loadPreviousJobs = useCallback(async () => {
    try {
      const response = await fetch('/api/exports');
      if (!response.ok) {
        return;
      }
      const data = await response.json();
      setPreviousJobs(data.jobs ?? []);
    } catch {
      // ignore list errors
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    const fetchConstituencies = async () => {
      setIsLoadingConstituencies(true);
      try {
        const response = await fetch('/api/constituency?activeOnly=true');
        if (!response.ok) {
          throw new Error('Failed to fetch constituencies');
        }
        const data = await response.json();
        setConstituencies(
          data.map((item: ConstituencyOption) => ({
            _id: item._id,
            halkaName: item.halkaName,
            blockCodes: item.blockCodes ?? [],
          }))
        );
      } catch {
        toast.error('Failed to fetch constituencies');
      } finally {
        setIsLoadingConstituencies(false);
      }
    };

    void fetchConstituencies();
    void loadPreviousJobs();
  }, [isAdmin, loadPreviousJobs]);

  const availableBlockCodes = useMemo(() => {
    const entries: Array<{ blockCode: string; halkaName: string }> = [];
    const seen = new Set<string>();

    for (const constituency of constituencies) {
      if (!selectedHalkas.includes(constituency.halkaName)) {
        continue;
      }
      for (const blockCode of constituency.blockCodes ?? []) {
        const key = `${constituency.halkaName}:${blockCode}`;
        if (!seen.has(key)) {
          seen.add(key);
          entries.push({ blockCode, halkaName: constituency.halkaName });
        }
      }
    }

    return entries.sort((a, b) =>
      a.halkaName === b.halkaName ? a.blockCode.localeCompare(b.blockCode) : a.halkaName.localeCompare(b.halkaName)
    );
  }, [constituencies, selectedHalkas]);

  const filteredBlockCodes = useMemo(() => {
    const query = blockCodeSearch.trim().toLowerCase();
    if (!query) {
      return availableBlockCodes;
    }
    return availableBlockCodes.filter(
      (entry) =>
        entry.blockCode.toLowerCase().includes(query) || entry.halkaName.toLowerCase().includes(query)
    );
  }, [availableBlockCodes, blockCodeSearch]);

  useEffect(() => {
    if (selectAllBlockCodes) {
      setSelectedBlockCodes(availableBlockCodes.map((entry) => entry.blockCode));
    }
  }, [selectAllBlockCodes, availableBlockCodes]);

  useEffect(() => {
    if (mode === 'default_per_blockcode') {
      setSelectedFields([...DEFAULT_EXPORT_FIELD_IDS]);
      setSelectAllBlockCodes(true);
    }
  }, [mode]);

  const toggleHalka = (halkaName: string) => {
    setSelectedHalkas((current) =>
      current.includes(halkaName) ? current.filter((name) => name !== halkaName) : [...current, halkaName]
    );
    setSelectAllBlockCodes(false);
    setSelectedBlockCodes([]);
  };

  const toggleBlockCode = (blockCode: string) => {
    setSelectAllBlockCodes(false);
    setSelectedBlockCodes((current) =>
      current.includes(blockCode) ? current.filter((code) => code !== blockCode) : [...current, blockCode]
    );
  };

  const toggleField = (fieldId: string) => {
    setSelectedFields((current) =>
      current.includes(fieldId) ? current.filter((field) => field !== fieldId) : [...current, fieldId]
    );
  };

  const runExportLoop = useCallback(async (jobId: string) => {
    abortRef.current = false;
    setIsProcessing(true);

    try {
      while (!abortRef.current) {
        const response = await fetch(`/api/exports/${jobId}/process`, { method: 'POST' });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Export batch failed');
        }

        const job = data.job as ExportJob;
        setActiveJob(job);
        void loadPreviousJobs();

        if (['completed', 'failed', 'cancelled', 'size_exceeded'].includes(job.status)) {
          if (job.status === 'completed') {
            toast.success('Export completed');
          } else if (job.status === 'size_exceeded') {
            toast.error(job.error || `Export exceeded ${EXPORT_FILE_SIZE_UI_MB} MB limit`);
          } else if (job.status === 'failed') {
            toast.error(job.error || 'Export failed');
          }
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Export failed');
    } finally {
      setIsProcessing(false);
    }
  }, [loadPreviousJobs]);

  const startExport = async (exportMode: ExportMode) => {
    if (!selectedHalkas.length) {
      toast.error('Select at least one constituency');
      return;
    }

    if (exportMode === 'custom' && !selectAllBlockCodes && !selectedBlockCodes.length) {
      toast.error('Select at least one block code');
      return;
    }

    if (exportMode === 'custom' && !selectedFields.length) {
      toast.error('Select at least one field');
      return;
    }

    setIsStarting(true);
    try {
      const response = await fetch('/api/exports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          halkaNames: selectedHalkas,
          blockCodes: selectAllBlockCodes ? [] : selectedBlockCodes,
          selectAllBlockCodes: selectAllBlockCodes || exportMode === 'default_per_blockcode',
          fields: exportMode === 'default_per_blockcode' ? DEFAULT_EXPORT_FIELD_IDS : selectedFields,
          format,
          mode: exportMode,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to start export');
      }

      const job = data.job as ExportJob;
      setActiveJob(job);
      setMode(exportMode);
      toast.success('Export started');
      await runExportLoop(job._id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to start export');
    } finally {
      setIsStarting(false);
    }
  };

  const resumeJob = async (job: ExportJob) => {
    try {
      const response = await fetch(`/api/exports/${job._id}/resume`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to resume export');
      }
      setActiveJob(data.job as ExportJob);
      toast.success('Export resumed');
      await runExportLoop(job._id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to resume export');
    }
  };

  const downloadFile = (jobId: string, fileName: string) => {
    window.open(`/api/exports/${jobId}/download?file=${encodeURIComponent(fileName)}`, '_blank');
  };

  if (!isAdmin) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-900">
        Export is available to admin users only.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <ExportGuidePanel />

      <div className="bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6 space-y-6">
          <div>
            <h3 className="text-lg font-medium text-gray-900">Export voters</h3>
            <p className="mt-1 text-sm text-gray-500">
              Export voter data with optional phone numbers. Each file is limited to {EXPORT_FILE_SIZE_UI_MB} MB.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-medium text-gray-900">Constituencies</h4>
            {isLoadingConstituencies ? (
              <p className="mt-2 text-sm text-gray-500">Loading constituencies...</p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {constituencies.map((constituency) => {
                  const selected = selectedHalkas.includes(constituency.halkaName);
                  return (
                    <button
                      key={constituency._id}
                      type="button"
                      onClick={() => toggleHalka(constituency.halkaName)}
                      className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset ${
                        selected
                          ? 'bg-indigo-600 text-white ring-indigo-600'
                          : 'bg-white text-gray-700 ring-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {constituency.halkaName}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {selectedHalkas.length > 0 && mode === 'custom' && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h4 className="text-sm font-medium text-gray-900">Block codes</h4>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={selectAllBlockCodes}
                    onChange={(e) => setSelectAllBlockCodes(e.target.checked)}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
                  />
                  Select all ({availableBlockCodes.length})
                </label>
              </div>

              <input
                type="text"
                value={blockCodeSearch}
                onChange={(e) => setBlockCodeSearch(e.target.value)}
                placeholder="Quick search block codes..."
                className="mt-3 block w-full rounded-lg border-0 py-2.5 px-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
              />

              {!selectAllBlockCodes && (
                <div className="mt-3 max-h-56 overflow-y-auto rounded-lg border border-gray-200">
                  {filteredBlockCodes.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-gray-500">No block codes match your search.</p>
                  ) : (
                    filteredBlockCodes.map((entry) => {
                      const checked = selectedBlockCodes.includes(entry.blockCode);
                      return (
                        <label
                          key={`${entry.halkaName}-${entry.blockCode}`}
                          className="flex cursor-pointer items-center gap-3 border-b border-gray-100 px-4 py-2 last:border-b-0 hover:bg-gray-50"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleBlockCode(entry.blockCode)}
                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
                          />
                          <span className="font-mono text-sm text-gray-900">{entry.blockCode}</span>
                          <span className="text-xs text-gray-500">{entry.halkaName}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              )}

              {(selectAllBlockCodes || selectedBlockCodes.length > 0) && (
                <p className="mt-2 text-sm text-gray-600">
                  Selected: {selectAllBlockCodes ? availableBlockCodes.length : selectedBlockCodes.length} block
                  code(s)
                </p>
              )}
            </div>
          )}

          {mode === 'custom' && (
            <div>
              <h4 className="text-sm font-medium text-gray-900">Fields</h4>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {EXPORT_FIELD_DEFINITIONS.map((field) => (
                  <label key={field.id} className="flex items-center gap-2 text-sm text-gray-700">
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
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="export-format" className="block text-sm font-medium text-gray-700">
                Format
              </label>
              <select
                id="export-format"
                value={format}
                onChange={(e) => setFormat(e.target.value as ExportFormat)}
                className="mt-1 block w-full rounded-lg border-0 py-2.5 px-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
              >
                <option value="csv">CSV</option>
                <option value="xlsx">XLSX</option>
              </select>
            </div>
            <div>
              <label htmlFor="export-mode" className="block text-sm font-medium text-gray-700">
                Export mode
              </label>
              <select
                id="export-mode"
                value={mode}
                onChange={(e) => setMode(e.target.value as ExportMode)}
                className="mt-1 block w-full rounded-lg border-0 py-2.5 px-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
              >
                <option value="custom">Custom (single combined file)</option>
                <option value="default_per_blockcode">Default (one file per block code)</option>
              </select>
            </div>
          </div>

          {mode === 'default_per_blockcode' && (
            <div className="rounded-md bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
              Default export uses name, CNIC, and phone number for every block code in the selected
              constituencies. Each file is named after its block code.
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={isStarting || isProcessing || !selectedHalkas.length}
              onClick={() => startExport(mode)}
              className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isStarting ? 'Starting...' : mode === 'default_per_blockcode' ? 'Run default export' : 'Run export'}
            </button>
            {isProcessing && (
              <button
                type="button"
                onClick={() => {
                  abortRef.current = true;
                }}
                className="rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
              >
                Stop polling
              </button>
            )}
          </div>
        </div>
      </div>

      {activeJob && (
        <div className="bg-white shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-medium text-gray-900">Current export</h3>
                <p className="text-sm text-gray-500">
                  {statusLabel(activeJob.status)}
                  {activeJob.currentBlockCode ? ` · Block ${activeJob.currentBlockCode}` : ''}
                </p>
              </div>
              <span className="text-sm font-medium text-gray-700">
                {activeJob.processedVoters} / {activeJob.totalVoters} voters
              </span>
            </div>

            <Progress value={activeJob.progressPercent} className="h-3" />
            <p className="text-sm text-gray-600">{activeJob.progressPercent}% complete</p>

            {activeJob.error && (
              <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{activeJob.error}</div>
            )}

            {activeJob.outputFiles.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-gray-900">Download files</h4>
                {activeJob.outputFiles.map((file) => (
                  <div
                    key={file.fileName}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">{file.fileName}</p>
                      <p className="text-xs text-gray-500">
                        {file.rowCount} rows · {formatBytes(file.sizeBytes)}
                        {file.blockCode ? ` · ${file.halkaName}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => downloadFile(activeJob._id, file.fileName)}
                      className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
                    >
                      Download
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-medium text-gray-900">Previous exports</h3>
            <button
              type="button"
              onClick={() => void loadPreviousJobs()}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
            >
              Refresh
            </button>
          </div>

          {previousJobs.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">No previous exports yet.</p>
          ) : (
            <div className="mt-4 divide-y divide-gray-200">
              {previousJobs.map((job) => (
                <div key={job._id} className="py-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {job.halkaNames.join(', ')} · {statusLabel(job.status)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(job.createdAt).toLocaleString()} · {job.mode === 'default_per_blockcode' ? 'Default per block code' : 'Custom'} · {job.format.toUpperCase()}
                      </p>
                      {job.error && <p className="mt-1 text-xs text-red-700">{job.error}</p>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {job.resumable && (
                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={() => void resumeJob(job)}
                          className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-indigo-600 ring-1 ring-inset ring-indigo-200 hover:bg-indigo-50 disabled:opacity-50"
                        >
                          Resume
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setActiveJob(job)}
                        className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                      >
                        View
                      </button>
                    </div>
                  </div>

                  {job.outputFiles.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {job.outputFiles.map((file) => (
                        <button
                          key={`${job._id}-${file.fileName}`}
                          type="button"
                          onClick={() => downloadFile(job._id, file.fileName)}
                          className="rounded-md bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-200 hover:bg-gray-100"
                        >
                          {file.fileName} ({formatBytes(file.sizeBytes)})
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
