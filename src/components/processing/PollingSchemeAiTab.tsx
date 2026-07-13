'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, onValue, ref } from 'firebase/database';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { firebaseConfig, isFirebaseClientConfigured } from '@/config/firebase';
import { Progress } from '@/components/ui/progress';
import type { PollingSchemeAiJob, PollingSchemeAiLogEntry } from '@/lib/polling-scheme/ai-job-types';
import {
  computeFileSha256,
  countPdfPages,
  runPollingSchemeAiJob,
} from '@/lib/polling-scheme/browser-pdf-processor';

interface ConstituencyOption {
  _id: string;
  halkaName: string;
}

function halkaKey(halkaName: string): string {
  return halkaName.replace(/\s+/g, '').toUpperCase().replace(/[.#$/[\]]/g, '_');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export default function PollingSchemeAiTab() {
  const [constituencies, setConstituencies] = useState<ConstituencyOption[]>([]);
  const [halkaName, setHalkaName] = useState('');
  const [district, setDistrict] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileHash, setFileHash] = useState('');
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [activeJob, setActiveJob] = useState<PollingSchemeAiJob | null>(null);
  const [recentJobs, setRecentJobs] = useState<PollingSchemeAiJob[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [pageProgress, setPageProgress] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [currentStage, setCurrentStage] = useState('');
  const [localLogs, setLocalLogs] = useState<PollingSchemeAiLogEntry[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const elapsedMs = startedAt ? Date.now() - startedAt : 0;

  useEffect(() => {
    fetch('/api/constituency?activeOnly=true')
      .then((response) => response.json())
      .then((data: ConstituencyOption[]) => {
        setConstituencies(data);
        if (data.length && !halkaName) {
          setHalkaName(data[0].halkaName);
        }
      })
      .catch(() => undefined);
  }, [halkaName]);

  const refreshJobs = useCallback(async () => {
    if (!halkaName) return;
    const response = await fetch(
      `/api/polling-scheme/ai-jobs?halkaName=${encodeURIComponent(halkaName)}`
    );
    if (!response.ok) return;
    const data = await response.json();
    setRecentJobs(data.jobs ?? []);
  }, [halkaName]);

  useEffect(() => {
    void refreshJobs();
    const interval = setInterval(() => void refreshJobs(), 5000);
    return () => clearInterval(interval);
  }, [refreshJobs]);

  useEffect(() => {
    if (!activeJob || !halkaName || !isFirebaseClientConfigured()) {
      return;
    }

    const app = getApps().length
      ? getApps()[0]
      : initializeApp({
          apiKey: firebaseConfig.apiKey,
          authDomain: firebaseConfig.authDomain,
          projectId: firebaseConfig.projectId,
          databaseURL: firebaseConfig.databaseURL,
          appId: firebaseConfig.appId,
        });

    const db = getDatabase(app);
    const jobRef = ref(db, `polling-scheme-ai/${halkaKey(halkaName)}/jobs/${activeJob._id}`);
    const unsubscribe = onValue(jobRef, (snapshot) => {
      if (!snapshot.exists()) return;
      const live = snapshot.val() as Partial<PollingSchemeAiJob> & { recentLogs?: PollingSchemeAiLogEntry[] };
      setActiveJob((prev) =>
        prev
          ? {
              ...prev,
              status: live.status ?? prev.status,
              counters: live.counters ?? prev.counters,
              logs: live.recentLogs ?? prev.logs,
            }
          : prev
      );
    });

    return () => unsubscribe();
  }, [activeJob?._id, halkaName]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (!selected) return;

    if (!selected.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Please select a PDF file');
      return;
    }

    setFile(selected);
    setPageCount(null);
    setFileHash('');
    setActiveJob(null);
    setLocalLogs([]);

    try {
      const hash = await computeFileSha256(selected);
      setFileHash(hash);
      const count = await countPdfPages(selected);
      setPageCount(count);
    } catch {
      toast.error('Failed to read PDF metadata');
    }
  };

  const appendLog = (message: string) => {
    const entry: PollingSchemeAiLogEntry = {
      at: new Date().toISOString(),
      level: 'info',
      message,
    };
    setLocalLogs((prev) => [...prev, entry].slice(-200));
  };

  const resumeJob = useMemo(() => {
    if (!file || !fileHash) return null;
    return recentJobs.find(
      (job) =>
        job.fileHash === fileHash &&
        ['uploaded', 'processing', 'paused', 'partial'].includes(job.status)
    );
  }, [file, fileHash, recentJobs]);

  const handleStart = async () => {
    if (!file || !halkaName) {
      toast.error('Select a constituency and PDF file');
      return;
    }

    abortRef.current = new AbortController();
    setIsProcessing(true);
    setStartedAt(Date.now());
    setUploadProgress(0);
    setPageProgress(0);
    setCurrentPage(0);
    setLocalLogs([]);

    try {
      const job = await runPollingSchemeAiJob({
        file,
        halkaName,
        district: district.trim() || undefined,
        existingJob: resumeJob ?? activeJob,
        options: {
          signal: abortRef.current.signal,
          onUploadProgress: (loaded, total) => {
            setUploadProgress(total ? Math.round((loaded / total) * 100) : 0);
          },
          onPageProgress: (page, total, stage) => {
            setCurrentPage(page);
            setCurrentStage(stage);
            setPageProgress(total ? Math.round((page / total) * 100) : 0);
          },
          onLog: appendLog,
          onJobUpdate: setActiveJob,
        },
      });

      setActiveJob(job);
      toast.success(`Polling scheme import ${job.status}`);
      void refreshJobs();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        toast('Processing paused');
        appendLog('Processing cancelled by user');
      } else {
        toast.error(error instanceof Error ? error.message : 'Processing failed');
        appendLog(error instanceof Error ? error.message : 'Processing failed');
      }
    } finally {
      setIsProcessing(false);
      abortRef.current = null;
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    if (activeJob) {
      void fetch(`/api/polling-scheme/ai-jobs/${activeJob._id}/cancel`, { method: 'POST' });
    }
  };

  const displayLogs = useMemo(() => {
    const entries = [...(activeJob?.logs ?? []), ...localLogs];
    const unique = new Map<string, PollingSchemeAiLogEntry>();
    for (const entry of entries) {
      unique.set(`${entry.at}:${entry.level}:${entry.message}:${entry.page ?? ''}`, entry);
    }
    return Array.from(unique.values())
      .sort((left, right) => Date.parse(left.at) - Date.parse(right.at))
      .slice(-200);
  }, [activeJob?.logs, localLogs]);
  const counters = activeJob?.counters;

  return (
    <div className="space-y-6">
      <div className="bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6 space-y-4">
          <div>
            <h3 className="text-lg font-medium text-gray-900">AI Polling Scheme Import</h3>
            <p className="mt-1 text-sm text-gray-500">
              Upload a heavy PDF, extract ward/block codes and voter counts page-by-page with GPT-4o mini.
              Processing runs in this browser tab and can resume when you reopen the same PDF.
            </p>
          </div>

          <img
            src="/valid-polling-scheme.png"
            alt="Valid polling scheme layout"
            className="border rounded shadow max-w-full h-auto"
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">Constituency</label>
              <select
                value={halkaName}
                onChange={(event) => setHalkaName(event.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-gray-900"
                disabled={isProcessing}
              >
                {constituencies.map((item) => (
                  <option key={item._id} value={item.halkaName}>
                    {item.halkaName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">District (optional)</label>
              <input
                type="text"
                value={district}
                onChange={(event) => setDistrict(event.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-gray-900"
                disabled={isProcessing}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Polling scheme PDF</label>
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) => void handleFileChange(event)}
              disabled={isProcessing}
              className="mt-1 block w-full text-sm text-gray-700"
            />
            {file && (
              <div className="mt-2 text-xs text-gray-500 space-y-1">
                <div>
                  {file.name} · {formatBytes(file.size)}
                  {pageCount ? ` · ${pageCount} pages` : ''}
                </div>
                {fileHash && <div className="font-mono break-all">SHA-256: {fileHash}</div>}
                {resumeJob && (
                  <div className="text-indigo-600">
                    Resumable job found ({resumeJob.status}, {resumeJob.counters.pagesCompleted}/
                    {resumeJob.pageCount ?? '?'} pages done)
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleStart()}
              disabled={isProcessing || !file}
              className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              {isProcessing ? 'Processing…' : resumeJob ? 'Resume Processing' : 'Start Processing'}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={!isProcessing}
              className="inline-flex justify-center rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel / Pause
            </button>
          </div>
        </div>
      </div>

      {(isProcessing || activeJob) && (
        <div className="bg-white shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap justify-between gap-2">
              <h4 className="text-md font-medium text-gray-900">Progress</h4>
              {startedAt && <span className="text-sm text-gray-500">Elapsed {formatDuration(elapsedMs)}</span>}
            </div>

            {activeJob && (
              <div className="text-sm text-gray-600">
                Job <span className="font-mono">{activeJob._id}</span> · {activeJob.status} · model{' '}
                {activeJob.model}
              </div>
            )}

            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>PDF upload</span>
                <span>{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} />
            </div>

            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>
                  Page processing {currentPage > 0 ? `(page ${currentPage}${currentStage ? ` – ${currentStage}` : ''})` : ''}
                </span>
                <span>{pageProgress}%</span>
              </div>
              <Progress value={pageProgress} />
            </div>

            {counters && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div className="rounded border p-2">
                  <div className="text-gray-500">Pages</div>
                  <div className="font-medium">
                    {counters.pagesCompleted}/{counters.pagesTotal}
                  </div>
                </div>
                <div className="rounded border p-2">
                  <div className="text-gray-500">Rows upserted</div>
                  <div className="font-medium">{counters.rowsUpserted}</div>
                </div>
                <div className="rounded border p-2">
                  <div className="text-gray-500">Skipped</div>
                  <div className="font-medium">{counters.rowsSkipped}</div>
                </div>
                <div className="rounded border p-2">
                  <div className="text-gray-500">Warnings / errors</div>
                  <div className="font-medium">
                    {counters.warnings} / {counters.errors}
                  </div>
                </div>
              </div>
            )}

            <div>
              <h5 className="text-sm font-medium text-gray-900 mb-2">Live log</h5>
              <div className="h-48 overflow-y-auto rounded border bg-gray-50 p-3 font-mono text-xs text-gray-700 space-y-1">
                {displayLogs.length === 0 ? (
                  <div className="text-gray-400">Waiting for events…</div>
                ) : (
                  displayLogs.map((entry, index) => (
                    <div key={`${entry.at}-${index}`}>
                      <span className="text-gray-400">{new Date(entry.at).toLocaleTimeString()}</span>{' '}
                      <span
                        className={
                          entry.level === 'error'
                            ? 'text-red-600'
                            : entry.level === 'warn'
                              ? 'text-yellow-700'
                              : ''
                        }
                      >
                        {entry.message}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-md font-medium text-gray-900">Recent jobs ({halkaName})</h4>
            <Link
              href={`/dashboard/constituency?halka=${encodeURIComponent(halkaName)}`}
              className="text-sm text-indigo-600 hover:text-indigo-800"
            >
              Review polling scheme rows →
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">File</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Status</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Pages</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Rows</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Started</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {recentJobs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-gray-500">
                      No AI import jobs yet.
                    </td>
                  </tr>
                ) : (
                  recentJobs.map((job) => (
                    <tr key={job._id}>
                      <td className="px-3 py-2">{job.fileName}</td>
                      <td className="px-3 py-2">{job.status}</td>
                      <td className="px-3 py-2">
                        {job.counters.pagesCompleted}/{job.pageCount ?? job.counters.pagesTotal}
                      </td>
                      <td className="px-3 py-2">{job.counters.rowsUpserted}</td>
                      <td className="px-3 py-2">{new Date(job.createdAt).toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
