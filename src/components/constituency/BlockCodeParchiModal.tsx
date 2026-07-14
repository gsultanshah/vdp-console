'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import {
  ArrowDownTrayIcon,
  DocumentTextIcon,
  SparklesIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { Progress } from '@/components/ui/progress';
import { useVoterParchi } from '@/hooks/useVoterParchi';
import type { VoterParchiDesign } from '@/lib/voter-parchi/types';

export interface BlockCodeParchiLatestMeta {
  blockCode: string;
  fileName: string;
  voterCount: number;
  pageCount: number;
  sizeBytes: number;
  source: 'web' | 'cli' | string;
  generatedAt: string;
  downloadUrl: string;
}

interface BlockCodeParchiModalProps {
  isOpen: boolean;
  onClose: () => void;
  blockCode: string;
  halkaName: string;
  latest: BlockCodeParchiLatestMeta | null;
  onLatestChanged?: () => void;
}

function progressPercent(job: { processedVoters: number; totalVoters: number; status: string }): number {
  if (job.totalVoters <= 0) return job.status === 'completed' ? 100 : 0;
  return Math.min(100, Math.round((job.processedVoters / job.totalVoters) * 100));
}

export default function BlockCodeParchiModal({
  isOpen,
  onClose,
  blockCode,
  halkaName,
  latest,
  onLatestChanged,
}: BlockCodeParchiModalProps) {
  const normalizedHalka = useMemo(() => halkaName.replace(/\s+/g, '').toUpperCase(), [halkaName]);
  const [designs, setDesigns] = useState<VoterParchiDesign[]>([]);
  const [selectedDesignId, setSelectedDesignId] = useState('');
  const [loadingDesigns, setLoadingDesigns] = useState(false);
  const [genderFilter, setGenderFilter] = useState<'both' | 'male' | 'female'>('both');
  const [downloading, setDownloading] = useState(false);

  const {
    activeJob,
    isStarting,
    isProcessing,
    startJob,
    cancelProcessing,
  } = useVoterParchi(normalizedHalka, {
    blockCodeFilter: blockCode,
    autoDownloadOnComplete: false,
  });

  const loadDesigns = useCallback(async () => {
    setLoadingDesigns(true);
    try {
      const params = new URLSearchParams({ halkaName: normalizedHalka });
      const response = await fetch(`/api/voter-parchi/designs?${params.toString()}`);
      const data = (await response.json()) as { designs?: VoterParchiDesign[]; error?: string };
      if (!response.ok) throw new Error(data.error || 'Failed to load designs');
      const list = data.designs ?? [];
      setDesigns(list);
      const defaultDesign = list.find((design) => design.isDefault) ?? list[0];
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
    if (!isOpen) return;
    void loadDesigns();
  }, [isOpen, loadDesigns]);

  useEffect(() => {
    if (activeJob?.status === 'completed') {
      onLatestChanged?.();
    }
  }, [activeJob?.status, onLatestChanged]);

  const handleDownload = async () => {
    if (!latest) return;
    setDownloading(true);
    try {
      const response = await fetch(latest.downloadUrl);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || 'Download failed');
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = latest.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  const handleGenerate = async () => {
    if (!selectedDesignId) {
      toast.error('No parchi design available for this constituency.');
      return;
    }
    await startJob({
      halkaName: normalizedHalka,
      designId: selectedDesignId,
      selectAllBlockCodes: false,
      blockCodes: [blockCode],
      genderFilter,
    });
  };

  const busy = isStarting || isProcessing;
  const pct = activeJob ? progressPercent(activeJob) : 0;
  const canClose = !busy;

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={() => canClose && onClose()}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/40" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-xl">
                <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
                  <div>
                    <Dialog.Title className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                      <DocumentTextIcon className="h-5 w-5 text-fuchsia-600" />
                      Voter parchi
                    </Dialog.Title>
                    <p className="mt-1 text-sm text-gray-500">
                      Block <span className="font-mono font-medium text-gray-800">{blockCode}</span> ·{' '}
                      {normalizedHalka}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => canClose && onClose()}
                    disabled={!canClose}
                    className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>

                <div className="space-y-4 px-5 py-4">
                  {latest ? (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 p-4">
                      <p className="text-sm font-semibold text-emerald-900">Generated PDF available</p>
                      <p className="mt-1 text-xs text-emerald-800">
                        {latest.fileName} · {latest.voterCount.toLocaleString()} voters ·{' '}
                        {latest.pageCount} pages · {latest.source} ·{' '}
                        {new Date(latest.generatedAt).toLocaleString()}
                      </p>
                      <button
                        type="button"
                        onClick={() => void handleDownload()}
                        disabled={downloading || busy}
                        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <ArrowDownTrayIcon className="h-4 w-4" />
                        {downloading ? 'Downloading…' : 'Download PDF'}
                      </button>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                      No voter parchi PDF yet for this block. Generate one below.
                    </div>
                  )}

                  <div className="rounded-lg border border-gray-200 p-4">
                    <p className="text-sm font-semibold text-gray-900">
                      {latest ? 'Generate new' : 'Generate PDF'}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      Creates a fresh PDF and replaces the latest download for this block.
                    </p>
                    <div className="mt-3 flex flex-wrap items-end gap-3">
                      <label className="block text-sm">
                        <span className="font-medium text-gray-700">Design</span>
                        <select
                          value={selectedDesignId}
                          onChange={(event) => setSelectedDesignId(event.target.value)}
                          disabled={busy || loadingDesigns || designs.length === 0}
                          className="mt-1 block min-w-[180px] rounded-lg border border-gray-200 px-3 py-2"
                        >
                          {designs.map((design) => (
                            <option key={design._id} value={design._id}>
                              {design.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-sm">
                        <span className="font-medium text-gray-700">Gender</span>
                        <select
                          value={genderFilter}
                          onChange={(event) =>
                            setGenderFilter(event.target.value as typeof genderFilter)
                          }
                          disabled={busy}
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
                        disabled={busy || !selectedDesignId || loadingDesigns}
                        className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-fuchsia-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
                      >
                        <SparklesIcon className="h-4 w-4" />
                        {busy ? 'Generating…' : latest ? 'Generate new' : 'Generate PDF'}
                      </button>
                    </div>

                    {busy && activeJob && (
                      <div className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50/70 p-3">
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="font-medium text-indigo-900">Generating…</span>
                          <span className="text-xs text-indigo-700">
                            {activeJob.processedVoters.toLocaleString()} /{' '}
                            {activeJob.totalVoters.toLocaleString()} voters
                          </span>
                        </div>
                        <Progress value={pct} className="mt-2 h-2" />
                        <button
                          type="button"
                          onClick={cancelProcessing}
                          className="mt-2 text-xs font-medium text-indigo-700 hover:underline"
                        >
                          Stop after current batch
                        </button>
                      </div>
                    )}

                    {activeJob?.status === 'completed' && !busy && (
                      <p className="mt-3 text-sm text-emerald-700">
                        Generation complete. You can download the latest PDF above.
                      </p>
                    )}

                    {activeJob?.status === 'failed' && activeJob.error && (
                      <p className="mt-3 text-sm text-rose-700">{activeJob.error}</p>
                    )}
                  </div>
                </div>

                <div className="flex justify-end border-t border-gray-100 px-5 py-3">
                  <button
                    type="button"
                    onClick={() => canClose && onClose()}
                    disabled={!canClose}
                    className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                  >
                    Close
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
