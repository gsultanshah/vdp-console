'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import {
  CheckCircleIcon,
  DocumentTextIcon,
  ExclamationCircleIcon,
  SparklesIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { Progress } from '@/components/ui/progress';
import type { VoterParchiDesign, VoterParchiJob } from '@/lib/voter-parchi/types';

export type BulkParchiBlockStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped';

interface BlockRowState {
  blockCode: string;
  status: BulkParchiBlockStatus;
  message?: string;
  processedVoters?: number;
  totalVoters?: number;
}

interface BlockCodeBulkParchiModalProps {
  isOpen: boolean;
  onClose: () => void;
  halkaName: string;
  /** Ordered top → bottom as shown in the table */
  blockCodes: string[];
  readyBlockCodes: Set<string>;
  onLatestChanged?: () => void;
}

function jobProgressPercent(job: { processedVoters: number; totalVoters: number; status: string }): number {
  if (job.totalVoters <= 0) return job.status === 'completed' ? 100 : 0;
  return Math.min(100, Math.round((job.processedVoters / job.totalVoters) * 100));
}

async function processJobUntilDone(
  jobId: string,
  shouldStop: () => boolean,
  onProgress: (job: VoterParchiJob) => void
): Promise<VoterParchiJob> {
  while (!shouldStop()) {
    const response = await fetch(`/api/voter-parchi/jobs/${jobId}/process`, { method: 'POST' });
    const data = (await response.json()) as { job?: VoterParchiJob; error?: string };
    if (!response.ok) {
      throw new Error(data.error || 'Processing failed');
    }
    const job = data.job;
    if (!job) {
      throw new Error('Invalid job response');
    }
    onProgress(job);
    if (['completed', 'failed', 'cancelled'].includes(job.status)) {
      return job;
    }
  }
  throw new Error('Stopped');
}

export default function BlockCodeBulkParchiModal({
  isOpen,
  onClose,
  halkaName,
  blockCodes,
  readyBlockCodes,
  onLatestChanged,
}: BlockCodeBulkParchiModalProps) {
  const normalizedHalka = useMemo(() => halkaName.replace(/\s+/g, '').toUpperCase(), [halkaName]);
  const [designs, setDesigns] = useState<VoterParchiDesign[]>([]);
  const [selectedDesignId, setSelectedDesignId] = useState('');
  const [loadingDesigns, setLoadingDesigns] = useState(false);
  const [genderFilter, setGenderFilter] = useState<'both' | 'male' | 'female'>('both');
  const [skipReady, setSkipReady] = useState(true);
  const [rows, setRows] = useState<BlockRowState[]>([]);
  const [running, setRunning] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const stopRef = useRef(false);

  const queueCodes = useMemo(() => {
    if (!skipReady) return blockCodes;
    return blockCodes.filter((code) => {
      const digits = code.replace(/\D/g, '');
      return !(
        readyBlockCodes.has(code) ||
        (digits && readyBlockCodes.has(digits)) ||
        (digits && readyBlockCodes.has(digits.padStart(7, '0')))
      );
    });
  }, [blockCodes, readyBlockCodes, skipReady]);

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
    stopRef.current = false;
    setRunning(false);
    setCurrentIndex(-1);
    setRows(
      blockCodes.map((blockCode) => ({
        blockCode,
        status: 'pending',
      }))
    );
    void loadDesigns();
  }, [isOpen, blockCodes, loadDesigns]);

  const updateRow = useCallback((blockCode: string, patch: Partial<BlockRowState>) => {
    setRows((current) =>
      current.map((row) => (row.blockCode === blockCode ? { ...row, ...patch } : row))
    );
  }, []);

  const completedCount = rows.filter((row) => row.status === 'completed').length;
  const failedCount = rows.filter((row) => row.status === 'failed').length;
  const skippedCount = rows.filter((row) => row.status === 'skipped').length;
  const doneCount = completedCount + failedCount + skippedCount;
  const overallPct =
    rows.length === 0 ? 0 : Math.min(100, Math.round((doneCount / rows.length) * 100));

  const handleStart = async () => {
    if (!selectedDesignId) {
      toast.error('No parchi design available for this constituency.');
      return;
    }
    if (queueCodes.length === 0) {
      toast.error(skipReady ? 'All listed blocks already have a voter parchi.' : 'No block codes to process.');
      return;
    }

    stopRef.current = false;
    setRunning(true);

    // Mark non-queued as skipped when skipReady is on.
    if (skipReady) {
      for (const code of blockCodes) {
        if (!queueCodes.includes(code)) {
          updateRow(code, { status: 'skipped', message: 'Already generated' });
        }
      }
    }

    let success = 0;
    let failed = 0;

    for (let index = 0; index < queueCodes.length; index += 1) {
      if (stopRef.current) break;

      const blockCode = queueCodes[index];
      setCurrentIndex(blockCodes.indexOf(blockCode));
      updateRow(blockCode, {
        status: 'running',
        message: 'Starting…',
        processedVoters: 0,
        totalVoters: 0,
      });

      try {
        const createResponse = await fetch('/api/voter-parchi/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            halkaName: normalizedHalka,
            designId: selectedDesignId,
            selectAllBlockCodes: false,
            blockCodes: [blockCode],
            genderFilter,
          }),
        });
        const createData = (await createResponse.json()) as {
          job?: VoterParchiJob;
          error?: string;
          requiresPollingStationOverride?: boolean;
          blockCode?: string;
        };
        let createdJob = createData.job;
        let createError = createData.error;
        if (!createResponse.ok && createData.requiresPollingStationOverride) {
          const override = window.prompt(
            `Polling station was not found for block ${createData.blockCode ?? blockCode}. Enter polling station for this block:`
          );
          if (!override?.trim()) {
            throw new Error('Polling station is required for this block');
          }

          const saveResponse = await fetch('/api/voter-parchi/polling-stations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              halkaName: normalizedHalka,
              blockCode,
              pollingStation: override.trim(),
            }),
          });
          if (!saveResponse.ok) {
            const saveData = (await saveResponse.json().catch(() => ({}))) as { error?: string };
            throw new Error(saveData.error || 'Failed to save polling station');
          }

          const retryResponse = await fetch('/api/voter-parchi/jobs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              halkaName: normalizedHalka,
              designId: selectedDesignId,
              selectAllBlockCodes: false,
              blockCodes: [blockCode],
              genderFilter,
              pollingStationOverride: override.trim(),
            }),
          });
          const retryData = (await retryResponse.json()) as {
            job?: VoterParchiJob;
            error?: string;
          };
          if (!retryResponse.ok || !retryData.job?._id) {
            throw new Error(retryData.error || 'Failed to start job');
          }
          createdJob = retryData.job;
          createError = retryData.error;
        }

        if (!createdJob?._id) {
          throw new Error(createError || 'Failed to start job');
        }

        if (createdJob.status === 'failed') {
          throw new Error(createdJob.error || 'No voters for this block');
        }

        const finalJob = await processJobUntilDone(
          createdJob._id,
          () => stopRef.current,
          (job) => {
            updateRow(blockCode, {
              status: 'running',
              processedVoters: job.processedVoters,
              totalVoters: job.totalVoters,
              message: `${job.processedVoters}/${job.totalVoters} voters`,
            });
          }
        );

        if (finalJob.status === 'completed') {
          success += 1;
          updateRow(blockCode, {
            status: 'completed',
            processedVoters: finalJob.processedVoters,
            totalVoters: finalJob.totalVoters,
            message: `${finalJob.outputFiles.length} PDF part(s)`,
          });
          onLatestChanged?.();
        } else {
          failed += 1;
          updateRow(blockCode, {
            status: 'failed',
            message: finalJob.error || finalJob.status,
          });
        }
      } catch (error) {
        if (stopRef.current && error instanceof Error && error.message === 'Stopped') {
          updateRow(blockCode, { status: 'pending', message: 'Stopped' });
          break;
        }
        failed += 1;
        updateRow(blockCode, {
          status: 'failed',
          message: error instanceof Error ? error.message : 'Failed',
        });
      }
    }

    setRunning(false);
    setCurrentIndex(-1);
    onLatestChanged?.();

    if (stopRef.current) {
      toast('Bulk parchi generation stopped.');
    } else {
      toast.success(`Bulk finished — ${success} completed, ${failed} failed`);
    }
  };

  const handleStop = () => {
    stopRef.current = true;
  };

  const canClose = !running;

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
              <Dialog.Panel className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
                <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
                  <div>
                    <Dialog.Title className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                      <DocumentTextIcon className="h-5 w-5 text-fuchsia-600" />
                      Bulk voter parchi
                    </Dialog.Title>
                    <p className="mt-1 text-sm text-gray-500">
                      Generates one block at a time, top → bottom · {normalizedHalka}
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

                <div className="space-y-4 overflow-y-auto px-5 py-4">
                  <div className="rounded-lg border border-gray-200 p-4">
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="block text-sm">
                        <span className="font-medium text-gray-700">Design</span>
                        <select
                          value={selectedDesignId}
                          onChange={(event) => setSelectedDesignId(event.target.value)}
                          disabled={running || loadingDesigns || designs.length === 0}
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
                          disabled={running}
                          className="mt-1 block rounded-lg border border-gray-200 px-3 py-2"
                        >
                          <option value="both">Both</option>
                          <option value="male">Male</option>
                          <option value="female">Female</option>
                        </select>
                      </label>
                      <label className="flex items-center gap-2 pb-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={skipReady}
                          onChange={(event) => setSkipReady(event.target.checked)}
                          disabled={running}
                          className="rounded border-gray-300 text-fuchsia-600 focus:ring-fuchsia-500"
                        />
                        Skip blocks that already have a PDF
                      </label>
                    </div>
                    <p className="mt-3 text-xs text-gray-500">
                      {blockCodes.length} block{blockCodes.length === 1 ? '' : 's'} in table order
                      {skipReady
                        ? ` · ${queueCodes.length} will generate`
                        : ' · all will regenerate'}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {!running ? (
                        <button
                          type="button"
                          onClick={() => void handleStart()}
                          disabled={loadingDesigns || !selectedDesignId || queueCodes.length === 0}
                          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-fuchsia-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
                        >
                          <SparklesIcon className="h-4 w-4" />
                          Start bulk generation
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleStop}
                          className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100"
                        >
                          Stop after current block
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-3">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium text-indigo-900">Overall progress</span>
                      <span className="text-xs text-indigo-700">
                        {doneCount}/{rows.length} · {completedCount} ok · {failedCount} failed ·{' '}
                        {skippedCount} skipped
                      </span>
                    </div>
                    <Progress value={overallPct} className="mt-2 h-2" />
                  </div>

                  <div className="overflow-hidden rounded-lg border border-gray-200">
                    <div className="max-h-72 overflow-y-auto">
                      <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="sticky top-0 bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold text-gray-700">#</th>
                            <th className="px-3 py-2 text-left font-semibold text-gray-700">Block</th>
                            <th className="px-3 py-2 text-left font-semibold text-gray-700">Status</th>
                            <th className="px-3 py-2 text-left font-semibold text-gray-700">Detail</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                          {rows.map((row, index) => {
                            const isCurrent = running && currentIndex === index;
                            return (
                              <tr
                                key={row.blockCode}
                                className={isCurrent ? 'bg-indigo-50' : undefined}
                              >
                                <td className="px-3 py-2 text-gray-500">{index + 1}</td>
                                <td className="px-3 py-2 font-mono text-gray-900">{row.blockCode}</td>
                                <td className="px-3 py-2">
                                  {row.status === 'completed' && (
                                    <span className="inline-flex items-center gap-1 text-emerald-700">
                                      <CheckCircleIcon className="h-4 w-4" /> Done
                                    </span>
                                  )}
                                  {row.status === 'failed' && (
                                    <span className="inline-flex items-center gap-1 text-rose-700">
                                      <ExclamationCircleIcon className="h-4 w-4" /> Failed
                                    </span>
                                  )}
                                  {row.status === 'running' && (
                                    <span className="font-medium text-indigo-700">
                                      Running
                                      {typeof row.totalVoters === 'number' && row.totalVoters > 0
                                        ? ` · ${jobProgressPercent({
                                            processedVoters: row.processedVoters ?? 0,
                                            totalVoters: row.totalVoters,
                                            status: 'running',
                                          })}%`
                                        : ''}
                                    </span>
                                  )}
                                  {row.status === 'skipped' && (
                                    <span className="text-slate-500">Skipped</span>
                                  )}
                                  {row.status === 'pending' && (
                                    <span className="text-slate-400">Pending</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-xs text-gray-600">
                                  {row.message ?? '—'}
                                  {row.status === 'running' &&
                                    typeof row.totalVoters === 'number' &&
                                    row.totalVoters > 0 && (
                                      <div className="mt-1">
                                        <Progress
                                          value={jobProgressPercent({
                                            processedVoters: row.processedVoters ?? 0,
                                            totalVoters: row.totalVoters,
                                            status: 'running',
                                          })}
                                          className="h-1.5"
                                        />
                                      </div>
                                    )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
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
