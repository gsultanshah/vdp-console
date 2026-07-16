'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import {
  ArrowsRightLeftIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { Progress } from '@/components/ui/progress';
import type { BlockCodeRenameJob } from '@/lib/blockcode-rename';

interface BlockCodeRenameModalProps {
  isOpen: boolean;
  onClose: () => void;
  blockCode: string;
  halkaName: string;
  onCompleted: (oldBlockCode: string, newBlockCode: string) => void;
}

function stepTone(status: string): string {
  switch (status) {
    case 'done':
      return 'text-emerald-700';
    case 'running':
      return 'text-indigo-700';
    case 'failed':
      return 'text-rose-700';
    case 'skipped':
      return 'text-slate-500';
    default:
      return 'text-slate-600';
  }
}

export default function BlockCodeRenameModal({
  isOpen,
  onClose,
  blockCode,
  halkaName,
  onCompleted,
}: BlockCodeRenameModalProps) {
  const [newBlockCode, setNewBlockCode] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [job, setJob] = useState<BlockCodeRenameJob | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setNewBlockCode('');
    setConfirmText('');
    setJob(null);
    setIsStarting(false);
    setIsRunning(false);
  }, [isOpen, blockCode]);

  const busy = isStarting || isRunning;
  const canClose = !busy;
  const progressPercent = useMemo(() => {
    if (!job?.steps?.length) return 0;
    const done = job.steps.filter((step) => ['done', 'skipped', 'failed'].includes(step.status)).length;
    return Math.round((done / job.steps.length) * 100);
  }, [job]);

  const handleStart = async () => {
    const nextCode = newBlockCode.trim();
    if (!nextCode) {
      toast.error('Enter the new block code.');
      return;
    }
    if (confirmText.trim() !== 'RENAME') {
      toast.error('Type RENAME to confirm.');
      return;
    }

    setIsStarting(true);
    try {
      const createResponse = await fetch('/api/blockcodes/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          halkaName,
          oldBlockCode: blockCode,
          newBlockCode: nextCode,
        }),
      });
      const createData = (await createResponse.json()) as {
        job?: BlockCodeRenameJob;
        error?: string;
      };
      if (!createResponse.ok || !createData.job?._id) {
        throw new Error(createData.error || 'Failed to start rename');
      }

      setJob(createData.job);
      setIsStarting(false);
      setIsRunning(true);

      let current = createData.job;
      while (current.status !== 'completed' && current.status !== 'failed') {
        const processResponse = await fetch('/api/blockcodes/rename', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'process',
            jobId: current._id,
          }),
        });
        const processData = (await processResponse.json()) as {
          job?: BlockCodeRenameJob;
          error?: string;
        };
        if (!processResponse.ok || !processData.job) {
          throw new Error(processData.error || 'Rename step failed');
        }
        current = processData.job;
        setJob(current);
      }

      if (current.status === 'failed') {
        throw new Error(current.error || 'Rename failed');
      }

      toast.success(`Block code changed from ${blockCode} to ${nextCode}`);
      onCompleted(blockCode, nextCode);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to rename block code');
    } finally {
      setIsStarting(false);
      setIsRunning(false);
    }
  };

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
              <Dialog.Panel className="w-full max-w-xl overflow-hidden rounded-xl bg-white shadow-xl">
                <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
                  <div>
                    <Dialog.Title className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                      <ArrowsRightLeftIcon className="h-5 w-5 text-amber-600" />
                      Change block code
                    </Dialog.Title>
                    <p className="mt-1 text-sm text-gray-500">
                      Admin only · updates voters, pages, users/access, polling scheme, and related records
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
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    <div className="flex gap-2">
                      <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0" />
                      <p>
                        This permanently renames block{' '}
                        <span className="font-mono font-semibold">{blockCode}</span> in{' '}
                        <span className="font-semibold">{halkaName}</span>. Make sure no one else is
                        processing this block while the rename runs.
                      </p>
                    </div>
                  </div>

                  {!job && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Current block code</label>
                        <input
                          type="text"
                          value={blockCode}
                          disabled
                          className="mt-1 block w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-sm text-gray-700"
                        />
                      </div>
                      <div>
                        <label htmlFor="new-block-code" className="block text-sm font-medium text-gray-700">
                          New block code
                        </label>
                        <input
                          id="new-block-code"
                          type="text"
                          value={newBlockCode}
                          onChange={(event) => setNewBlockCode(event.target.value)}
                          disabled={busy}
                          placeholder="e.g. 001238834"
                          className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm text-gray-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 disabled:bg-gray-50"
                        />
                      </div>
                      <div>
                        <label htmlFor="rename-confirm" className="block text-sm font-medium text-gray-700">
                          Type <span className="font-mono">RENAME</span> to confirm
                        </label>
                        <input
                          id="rename-confirm"
                          type="text"
                          value={confirmText}
                          onChange={(event) => setConfirmText(event.target.value)}
                          disabled={busy}
                          className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 disabled:bg-gray-50"
                        />
                      </div>
                    </div>
                  )}

                  {job && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <p className="font-medium text-gray-900">
                          {job.oldBlockCode} → {job.newBlockCode}
                        </p>
                        <span className="text-xs text-gray-500">{progressPercent}%</span>
                      </div>
                      <Progress value={progressPercent} className="h-2" />
                      <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-gray-200 p-3">
                        {job.steps.map((step) => (
                          <div key={step.id} className="flex items-start justify-between gap-3 text-sm">
                            <div>
                              <p className={`font-medium ${stepTone(step.status)}`}>
                                {step.status === 'done' || step.status === 'skipped' ? (
                                  <span className="inline-flex items-center gap-1">
                                    <CheckCircleIcon className="h-4 w-4" />
                                    {step.label}
                                  </span>
                                ) : (
                                  step.label
                                )}
                              </p>
                              {step.message && (
                                <p className="mt-0.5 text-xs text-gray-500">{step.message}</p>
                              )}
                            </div>
                            <span className={`shrink-0 text-xs font-semibold uppercase ${stepTone(step.status)}`}>
                              {step.status}
                            </span>
                          </div>
                        ))}
                      </div>
                      {job.status === 'failed' && job.error && (
                        <p className="text-sm text-rose-700">{job.error}</p>
                      )}
                      {job.status === 'completed' && (
                        <p className="text-sm text-emerald-700">
                          Rename completed. The block codes table will refresh with the new code.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-3 border-t border-gray-100 px-5 py-3">
                  <button
                    type="button"
                    onClick={() => canClose && onClose()}
                    disabled={!canClose}
                    className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                  >
                    {job?.status === 'completed' ? 'Close' : 'Cancel'}
                  </button>
                  {!job && (
                    <button
                      type="button"
                      onClick={() => void handleStart()}
                      disabled={busy || !newBlockCode.trim() || confirmText.trim() !== 'RENAME'}
                      className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      <ArrowsRightLeftIcon className="h-4 w-4" />
                      {isStarting ? 'Starting…' : 'Change block code'}
                    </button>
                  )}
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
