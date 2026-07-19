'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import {
  ArrowDownTrayIcon,
  DocumentTextIcon,
  PencilSquareIcon,
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
  genderFilter?: 'both' | 'male' | 'female' | null;
}

interface BlockCodeParchiModalProps {
  isOpen: boolean;
  onClose: () => void;
  blockCode: string;
  halkaName: string;
  latest: BlockCodeParchiLatestMeta | null;
  latestItems?: BlockCodeParchiLatestMeta[];
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
  latestItems,
  onLatestChanged,
}: BlockCodeParchiModalProps) {
  const normalizedHalka = useMemo(() => halkaName.replace(/\s+/g, '').toUpperCase(), [halkaName]);
  const [designs, setDesigns] = useState<VoterParchiDesign[]>([]);
  const [selectedDesignId, setSelectedDesignId] = useState('');
  const [loadingDesigns, setLoadingDesigns] = useState(false);
  const [genderFilter, setGenderFilter] = useState<'both' | 'male' | 'female'>('both');
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [pollingStation, setPollingStation] = useState('');
  const [pollingSource, setPollingSource] = useState<'override' | 'polling-scheme' | null>(null);
  const [loadingPollingStation, setLoadingPollingStation] = useState(false);
  const [editingPollingStation, setEditingPollingStation] = useState(false);
  const [savingPollingStation, setSavingPollingStation] = useState(false);
  const [activeGenderLabel, setActiveGenderLabel] = useState<string | null>(null);

  const resolvedLatestItems = useMemo(() => {
    if (latestItems && latestItems.length > 0) return latestItems;
    return latest ? [latest] : [];
  }, [latest, latestItems]);

  const { activeJob, isStarting, isProcessing, startJob, cancelProcessing } = useVoterParchi(
    normalizedHalka,
    {
      blockCodeFilter: blockCode,
      autoDownloadOnComplete: false,
    }
  );

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

  const loadPollingStation = useCallback(async () => {
    setLoadingPollingStation(true);
    try {
      const params = new URLSearchParams({
        halkaName: normalizedHalka,
        blockCode,
      });
      const response = await fetch(`/api/voter-parchi/polling-stations?${params.toString()}`);
      const data = (await response.json().catch(() => ({}))) as {
        pollingStation?: string;
        source?: 'override' | 'polling-scheme' | null;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load polling station');
      }
      setPollingStation(String(data.pollingStation ?? ''));
      setPollingSource(data.source ?? null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load polling station');
      setPollingStation('');
      setPollingSource(null);
    } finally {
      setLoadingPollingStation(false);
    }
  }, [blockCode, normalizedHalka]);

  const savePollingStation = useCallback(
    async (value = pollingStation, options?: { silent?: boolean }): Promise<string | null> => {
      const trimmed = value.trim();
      if (!trimmed) {
        toast.error('Polling station is required.');
        return null;
      }

      setSavingPollingStation(true);
      try {
        const response = await fetch('/api/voter-parchi/polling-stations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            halkaName: normalizedHalka,
            blockCode,
            pollingStation: trimmed,
          }),
        });
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) {
          throw new Error(data.error || 'Failed to save polling station');
        }
        setPollingStation(trimmed);
        setPollingSource('override');
        setEditingPollingStation(false);
        if (!options?.silent) {
          toast.success(`Polling station saved for block ${blockCode}.`);
        }
        return trimmed;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to save polling station');
        return null;
      } finally {
        setSavingPollingStation(false);
      }
    },
    [blockCode, normalizedHalka, pollingStation]
  );

  useEffect(() => {
    if (!isOpen) return;
    void loadDesigns();
    void loadPollingStation();
    setEditingPollingStation(false);
  }, [isOpen, loadDesigns, loadPollingStation]);

  useEffect(() => {
    if (activeJob?.status === 'completed') {
      onLatestChanged?.();
    }
  }, [activeJob?.status, onLatestChanged]);

  const handleDownload = async (item: BlockCodeParchiLatestMeta) => {
    const key = `${item.genderFilter ?? 'both'}:${item.fileName}`;
    setDownloadingKey(key);
    try {
      const response = await fetch(item.downloadUrl, { credentials: 'include' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || 'Download failed');
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = item.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Download failed');
    } finally {
      setDownloadingKey(null);
    }
  };

  const handleGenerate = async () => {
    if (!selectedDesignId) {
      toast.error('No parchi design available for this constituency.');
      return;
    }

    const stationValue = pollingStation.trim();
    if (!stationValue) {
      setEditingPollingStation(true);
      toast.error('Enter a polling station before generating.');
      return;
    }

    const savedOverride = await savePollingStation(stationValue, { silent: true });
    if (!savedOverride) {
      return;
    }

    // Always generate separate male/female PDFs when "both" is selected,
    // so each PDF's voter/parchi count matches that gender's voters.
    const genders: Array<'male' | 'female'> =
      genderFilter === 'both' ? ['male', 'female'] : [genderFilter];

    for (const gender of genders) {
      setActiveGenderLabel(gender);
      const result = await startJob({
        halkaName: normalizedHalka,
        designId: selectedDesignId,
        selectAllBlockCodes: false,
        blockCodes: [blockCode],
        genderFilter: gender,
        pollingStationOverride: savedOverride,
      });
      if (!result.ok) {
        break;
      }
    }
    setActiveGenderLabel(null);
    onLatestChanged?.();
  };

  const busy = isStarting || isProcessing;
  const pct = activeJob ? progressPercent(activeJob) : 0;
  const canClose = !busy;
  const hasLatest = resolvedLatestItems.length > 0;

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
              <Dialog.Panel className="w-full max-w-4xl overflow-hidden rounded-xl bg-white shadow-xl">
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

                <div className="grid grid-cols-1 gap-4 px-5 py-4 md:grid-cols-2 md:items-start">
                  <div className="flex h-full flex-col rounded-lg border border-slate-200 bg-slate-50/70 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Polling station</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {pollingSource === 'override'
                            ? 'Using saved override for this block'
                            : pollingSource === 'polling-scheme'
                              ? 'Loaded from polling scheme'
                              : 'No polling station saved for this block yet'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditingPollingStation((current) => !current)}
                        disabled={loadingPollingStation || savingPollingStation || busy}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-white disabled:opacity-50"
                      >
                        <PencilSquareIcon className="h-4 w-4" />
                        {editingPollingStation ? 'Close editor' : pollingStation.trim() ? 'Edit' : 'Add'}
                      </button>
                    </div>

                    {loadingPollingStation ? (
                      <p className="mt-3 text-sm text-slate-500">Loading polling station…</p>
                    ) : editingPollingStation ? (
                      <div className="mt-3 flex flex-1 flex-col space-y-3">
                        <textarea
                          rows={6}
                          value={pollingStation}
                          onChange={(event) => setPollingStation(event.target.value)}
                          disabled={savingPollingStation || busy}
                          placeholder="Enter polling station for this block"
                          className="block min-h-[140px] w-full flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 disabled:bg-gray-50"
                        />
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => void savePollingStation()}
                            disabled={savingPollingStation || busy}
                            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                          >
                            {savingPollingStation ? 'Saving…' : 'Save polling station'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-3 flex-1 text-sm leading-relaxed text-slate-700">
                        {pollingStation.trim() || 'No polling station set.'}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col gap-4">
                    {hasLatest ? (
                      <div className="space-y-3">
                        {resolvedLatestItems.map((item) => {
                          const genderLabel =
                            item.genderFilter === 'male'
                              ? 'Male'
                              : item.genderFilter === 'female'
                                ? 'Female'
                                : 'Combined';
                          const key = `${item.genderFilter ?? 'both'}:${item.fileName}`;
                          return (
                            <div
                              key={key}
                              className="rounded-lg border border-emerald-200 bg-emerald-50/80 p-4"
                            >
                              <p className="text-sm font-semibold text-emerald-900">
                                {genderLabel} PDF available
                              </p>
                              <p className="mt-1 text-xs text-emerald-800">
                                {item.fileName} · {item.voterCount.toLocaleString()} voters ·{' '}
                                {item.pageCount} pages
                                {' · '}
                                {item.source} · {new Date(item.generatedAt).toLocaleString()}
                              </p>
                              <button
                                type="button"
                                onClick={() => void handleDownload(item)}
                                disabled={Boolean(downloadingKey) || busy}
                                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                              >
                                <ArrowDownTrayIcon className="h-4 w-4" />
                                {downloadingKey === key
                                  ? 'Downloading…'
                                  : `Download ${genderLabel.toLowerCase()} PDF`}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                        No voter parchi PDF yet for this block. Generate one below.
                      </div>
                    )}

                    <div className="rounded-lg border border-gray-200 p-4">
                      <p className="text-sm font-semibold text-gray-900">
                        {hasLatest ? 'Generate new' : 'Generate PDF'}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        Creates separate male and female PDFs (when Both is selected). Each PDF
                        includes one parchi per voter for that gender.
                      </p>
                      <div className="mt-3 space-y-3">
                        <label className="block text-sm">
                          <span className="font-medium text-gray-700">Design</span>
                          <select
                            value={selectedDesignId}
                            onChange={(event) => setSelectedDesignId(event.target.value)}
                            disabled={busy || loadingDesigns || designs.length === 0}
                            className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2"
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
                            onChange={(event) => setGenderFilter(event.target.value as typeof genderFilter)}
                            disabled={busy}
                            className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2"
                          >
                            <option value="both">Both (separate male + female PDFs)</option>
                            <option value="male">Male only</option>
                            <option value="female">Female only</option>
                          </select>
                        </label>
                        <button
                          type="button"
                          onClick={() => void handleGenerate()}
                          disabled={busy || !selectedDesignId || loadingDesigns}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-fuchsia-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
                        >
                          <SparklesIcon className="h-4 w-4" />
                          {busy
                            ? `Generating${activeGenderLabel ? ` (${activeGenderLabel})` : ''}…`
                            : hasLatest
                              ? 'Generate new'
                              : 'Generate PDF'}
                        </button>
                      </div>

                      {busy && activeJob && (
                        <div className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50/70 p-3">
                          <div className="flex items-center justify-between gap-2 text-sm">
                            <span className="font-medium text-indigo-900">
                              Generating{activeGenderLabel ? ` ${activeGenderLabel}` : ''}…
                            </span>
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
                          Generation complete. Download male/female PDFs above.
                        </p>
                      )}

                      {activeJob?.status === 'failed' && activeJob.error && (
                        <p className="mt-3 text-sm text-rose-700">{activeJob.error}</p>
                      )}
                    </div>
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
