'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownTrayIcon,
  DocumentTextIcon,
  ShieldExclamationIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { Progress } from '@/components/ui/progress';
import type { BlockCodeContext } from '@/lib/blockcode-hub';
import { useVoterParchi } from '@/hooks/useVoterParchi';
import type { VoterParchiDesign } from '@/lib/voter-parchi/types';

interface BlockCodeParchiTabProps {
  context: BlockCodeContext;
}

function progressPercent(job: { processedVoters: number; totalVoters: number; status: string }): number {
  if (job.totalVoters <= 0) return job.status === 'completed' ? 100 : 0;
  return Math.min(100, Math.round((job.processedVoters / job.totalVoters) * 100));
}

export default function BlockCodeParchiTab({ context }: BlockCodeParchiTabProps) {
  const normalizedHalka = useMemo(
    () => context.halkaName.replace(/\s+/g, '').toUpperCase(),
    [context.halkaName]
  );
  const [isAdmin, setIsAdmin] = useState(false);
  const [designs, setDesigns] = useState<VoterParchiDesign[]>([]);
  const [selectedDesignId, setSelectedDesignId] = useState('');
  const [loadingDesigns, setLoadingDesigns] = useState(false);
  const [genderFilter, setGenderFilter] = useState<'both' | 'male' | 'female'>('both');
  const [voterCount, setVoterCount] = useState<number | null>(null);
  const [latestParchi, setLatestParchi] = useState<{
    fileName: string;
    voterCount: number;
    pageCount: number;
    sizeBytes: number;
    source: string;
    generatedAt: string;
    downloadUrl: string;
  } | null>(null);

  const {
    activeJob,
    previousJobs,
    isStarting,
    isProcessing,
    loadPreviousJobs,
    startJob,
    cancelProcessing,
    downloadFile,
  } = useVoterParchi(normalizedHalka, {
    blockCodeFilter: context.blockCode,
    autoDownloadOnComplete: true,
  });

  const loadLatestParchi = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        halkaName: normalizedHalka,
        blockCode: context.blockCode,
      });
      const response = await fetch(`/api/voter-parchi/latest?${params.toString()}`);
      if (!response.ok) {
        setLatestParchi(null);
        return;
      }
      const data = (await response.json()) as {
        item?: {
          fileName: string;
          voterCount: number;
          pageCount: number;
          sizeBytes: number;
          source: string;
          generatedAt: string | Date;
        } | null;
      };
      if (!data.item) {
        setLatestParchi(null);
        return;
      }
      setLatestParchi({
        fileName: data.item.fileName,
        voterCount: data.item.voterCount,
        pageCount: data.item.pageCount,
        sizeBytes: data.item.sizeBytes,
        source: data.item.source,
        generatedAt: String(data.item.generatedAt),
        downloadUrl: `/api/voter-parchi/latest/download/?halkaName=${encodeURIComponent(normalizedHalka)}&blockCode=${encodeURIComponent(context.blockCode)}`,
      });
    } catch {
      setLatestParchi(null);
    }
  }, [normalizedHalka, context.blockCode]);

  const downloadLatest = useCallback(async () => {
    if (!latestParchi) return;
    try {
      const response = await fetch(latestParchi.downloadUrl, { credentials: 'include' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || 'Download failed');
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = latestParchi.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Download failed');
    }
  }, [latestParchi]);

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

  const loadDesigns = useCallback(async () => {
    setLoadingDesigns(true);
    try {
      const params = new URLSearchParams({ halkaName: normalizedHalka });
      const res = await fetch(`/api/voter-parchi/designs?${params.toString()}`);
      const data = (await res.json()) as { designs?: VoterParchiDesign[]; error?: string };
      if (!res.ok) throw new Error(data.error || 'Failed to load designs');
      const list = data.designs ?? [];
      setDesigns(list);
      const defaultDesign = list.find((d) => d.isDefault) ?? list[0];
      if (defaultDesign?._id) {
        setSelectedDesignId(defaultDesign._id);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load designs');
    } finally {
      setLoadingDesigns(false);
    }
  }, [normalizedHalka]);

  useEffect(() => {
    if (!isAdmin) return;
    void loadDesigns();
    void loadPreviousJobs();
    void loadLatestParchi();
  }, [isAdmin, loadDesigns, loadPreviousJobs, loadLatestParchi]);

  useEffect(() => {
    if (activeJob?.status === 'completed') {
      void loadLatestParchi();
    }
  }, [activeJob?.status, loadLatestParchi]);

  useEffect(() => {
    const fetchCount = async () => {
      try {
        const params = new URLSearchParams({
          blockCode: context.blockCode,
          halkaName: context.halkaName,
          limit: '1',
        });
        if (genderFilter !== 'both') {
          params.set('gender', genderFilter);
        }
        const response = await fetch(`/api/voters/?${params.toString()}`);
        if (!response.ok) return;
        const data = await response.json();
        setVoterCount(typeof data.total === 'number' ? data.total : null);
      } catch {
        // ignore
      }
    };
    void fetchCount();
  }, [context.blockCode, context.halkaName, genderFilter]);

  const handleGenerate = async () => {
    if (!selectedDesignId) {
      toast.error('No parchi design available for this constituency.');
      return;
    }
    await startJob({
      halkaName: normalizedHalka,
      designId: selectedDesignId,
      selectAllBlockCodes: false,
      blockCodes: [context.blockCode],
      genderFilter,
    });
  };

  const currentJob = activeJob;
  const pct = currentJob ? progressPercent(currentJob) : 0;

  if (!isAdmin) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-8 text-center">
        <ShieldExclamationIcon className="mx-auto h-10 w-10 text-amber-600" />
        <h3 className="mt-3 text-lg font-medium text-amber-900">Admin access required</h3>
        <p className="mt-2 text-sm text-amber-800">
          Voter parchi generation is restricted to administrators.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-fuchsia-100 bg-fuchsia-50/60 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900">
              <DocumentTextIcon className="h-5 w-5 text-fuchsia-600" />
              Voter parchi
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              Generate printable voter slips for block{' '}
              <span className="font-mono font-medium">{context.blockCode}</span> in {normalizedHalka}.
              Files are named{' '}
              <span className="font-mono text-xs">
                {normalizedHalka}-{context.blockCode.replace(/\D/g, '') || context.blockCode}-DDMMYY-01.pdf
              </span>
              .
            </p>
          </div>
          {voterCount !== null && (
            <div className="rounded-lg bg-white px-4 py-2 text-sm shadow-sm ring-1 ring-gray-200">
              <span className="text-gray-500">Voters:</span>{' '}
              <span className="font-semibold text-gray-900">{voterCount.toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>

      {latestParchi && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-emerald-900">Latest voter parchi ready</p>
              <p className="mt-1 text-xs text-emerald-800">
                {latestParchi.fileName} · {latestParchi.voterCount.toLocaleString()} voters ·{' '}
                {latestParchi.pageCount} pages · {latestParchi.source} ·{' '}
                {new Date(latestParchi.generatedAt).toLocaleString()}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void downloadLatest()}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
            >
              <ArrowDownTrayIcon className="h-4 w-4" />
              Download latest PDF
            </button>
          </div>
        </div>
      )}

      <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Design</span>
            <select
              value={selectedDesignId}
              onChange={(e) => setSelectedDesignId(e.target.value)}
              disabled={loadingDesigns || designs.length === 0}
              className="mt-1 block min-w-[200px] rounded-lg border border-gray-200 px-3 py-2"
            >
              {designs.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Gender</span>
            <select
              value={genderFilter}
              onChange={(e) => setGenderFilter(e.target.value as typeof genderFilter)}
              className="mt-1 block rounded-lg border border-gray-200 px-3 py-2"
            >
              <option value="both">Both</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={isStarting || isProcessing || !selectedDesignId || loadingDesigns}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-600 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
          >
            <SparklesIcon className="h-4 w-4" />
            {isStarting || isProcessing
              ? 'Generating…'
              : latestParchi
                ? 'Regenerate PDF'
                : 'Generate PDF'}
          </button>
          {isProcessing && (
            <button
              type="button"
              onClick={cancelProcessing}
              className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              Stop after current batch
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-gray-500">
          PDF downloads automatically when generation completes. Manage parchi layout from the constituency home page.
        </p>
      </div>

      {currentJob && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-indigo-900">
              {currentJob.status === 'completed'
                ? 'Generation complete'
                : currentJob.status === 'failed'
                  ? 'Generation failed'
                  : 'Generating…'}
            </p>
            <span className="text-xs text-indigo-700">
              {currentJob.processedVoters.toLocaleString()} / {currentJob.totalVoters.toLocaleString()} voters
            </span>
          </div>
          <Progress value={pct} className="mt-2 h-2" />
          {currentJob.error && <p className="mt-2 text-xs text-rose-700">{currentJob.error}</p>}
          {currentJob.outputFiles.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-800">Download</p>
              {currentJob.outputFiles.map((file) => (
                <button
                  key={file.storagePath}
                  type="button"
                  onClick={() => void downloadFile(currentJob._id!, file.fileName)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm hover:bg-indigo-50"
                >
                  <span className="font-medium text-slate-800">{file.fileName}</span>
                  <span className="inline-flex items-center gap-1 text-indigo-600">
                    <ArrowDownTrayIcon className="h-4 w-4" />
                    {file.voterCount} voters · {(file.sizeBytes / 1024 / 1024).toFixed(1)} MB
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {previousJobs.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-slate-900">Previous downloads</h3>
          <div className="mt-2 space-y-2">
            {previousJobs.slice(0, 6).map((job) => (
              <div key={job._id} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-slate-800">{job.designName}</span>
                  <span className="text-xs text-slate-500">
                    {job.status} · {job.processedVoters}/{job.totalVoters}
                  </span>
                </div>
                {job.outputFiles.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {job.outputFiles.map((file) => (
                      <button
                        key={file.storagePath}
                        type="button"
                        onClick={() => void downloadFile(job._id!, file.fileName)}
                        className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline"
                      >
                        <ArrowDownTrayIcon className="h-3 w-3" />
                        {file.fileName}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
