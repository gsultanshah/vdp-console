'use client';

import { Fragment, useEffect, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { ClockIcon, XMarkIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import {
  BLOCK_WORK_STATUSES,
  BLOCK_WORK_STATUS_BADGE,
  BLOCK_WORK_STATUS_LABELS,
  saveBlockWorkProgress,
  type BlockWorkProgressRecord,
  type BlockWorkStatus,
} from '@/lib/block-work-progress';

interface BlockCodeWorkProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  blockCode: string;
  halkaName: string;
  initialRecord?: BlockWorkProgressRecord | null;
  onSaved: (record: BlockWorkProgressRecord) => void;
}

function formatDateTime(value: string) {
  try {
    return new Date(value).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return value;
  }
}

export default function BlockCodeWorkProgressModal({
  isOpen,
  onClose,
  blockCode,
  halkaName,
  initialRecord,
  onSaved,
}: BlockCodeWorkProgressModalProps) {
  const [status, setStatus] = useState<BlockWorkStatus>('pending');
  const [comments, setComments] = useState('');
  const [requestParchiGeneration, setRequestParchiGeneration] = useState(false);
  const [history, setHistory] = useState<BlockWorkProgressRecord['history']>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setStatus(initialRecord?.status ?? 'pending');
    setComments(initialRecord?.comments ?? '');
    setRequestParchiGeneration(Boolean(initialRecord?.requestParchiGeneration));
    setHistory(initialRecord?.history ?? []);
  }, [isOpen, initialRecord, blockCode]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const record = await saveBlockWorkProgress({
        halkaName,
        blockCode,
        status,
        comments,
        requestParchiGeneration,
      });
      setHistory(record.history);
      toast.success(`Block ${blockCode} marked as ${BLOCK_WORK_STATUS_LABELS[status]}`);
      onSaved(record);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={() => !isSaving && onClose()}>
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
              <Dialog.Panel className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-xl">
                <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4">
                  <div>
                    <Dialog.Title className="text-lg font-semibold text-gray-900">
                      Work progress — Block {blockCode}
                    </Dialog.Title>
                    <p className="mt-1 text-sm text-gray-500">{halkaName}</p>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={isSaving}
                    className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                  <fieldset>
                    <legend className="text-sm font-medium text-gray-900">Status</legend>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {BLOCK_WORK_STATUSES.map((option) => (
                        <label
                          key={option}
                          className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                            status === option
                              ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <input
                            type="radio"
                            name="work-status"
                            value={option}
                            checked={status === option}
                            onChange={() => setStatus(option)}
                            className="sr-only"
                          />
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${BLOCK_WORK_STATUS_BADGE[option]}`}
                          >
                            {BLOCK_WORK_STATUS_LABELS[option]}
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <div className="mt-6">
                    <label htmlFor="work-comments" className="block text-sm font-medium text-gray-900">
                      Comments
                    </label>
                    <textarea
                      id="work-comments"
                      rows={4}
                      value={comments}
                      onChange={(event) => setComments(event.target.value)}
                      placeholder="Notes about manual work, issues, or verification…"
                      className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 bg-slate-50 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={requestParchiGeneration}
                      onChange={(event) => setRequestParchiGeneration(event.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>
                      <span className="block text-sm font-medium text-gray-900">
                        Queue voter parchi generation
                      </span>
                      <span className="mt-0.5 block text-xs text-gray-500">
                        Automator will generate (or refresh) voter parchi for this block. Verified blocks are
                        also queued automatically when automation is enabled.
                      </span>
                    </span>
                  </label>

                  {initialRecord?.updatedBy ? (
                    <p className="mt-4 text-xs text-gray-500">
                      Last updated by {initialRecord.updatedBy.name || initialRecord.updatedBy.email}
                      {initialRecord.updatedAt ? ` · ${formatDateTime(initialRecord.updatedAt)}` : ''}
                    </p>
                  ) : null}

                  <div className="mt-6">
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                      <ClockIcon className="h-4 w-4 text-gray-500" />
                      Change log
                    </div>
                    {history.length === 0 ? (
                      <p className="mt-2 text-sm text-gray-500">No status changes recorded yet.</p>
                    ) : (
                      <ol className="mt-3 max-h-48 space-y-3 overflow-y-auto border-l-2 border-gray-200 pl-4">
                        {history.map((entry, index) => (
                          <li key={`${entry.changedAt}-${index}`} className="relative text-sm">
                            <span className="absolute -left-[1.35rem] top-1.5 h-2 w-2 rounded-full bg-indigo-400" />
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${BLOCK_WORK_STATUS_BADGE[entry.status]}`}
                              >
                                {BLOCK_WORK_STATUS_LABELS[entry.status]}
                              </span>
                              <span className="text-xs text-gray-500">{formatDateTime(entry.changedAt)}</span>
                            </div>
                            <p className="mt-0.5 text-xs text-gray-600">
                              {entry.changedBy.name || entry.changedBy.email}
                            </p>
                            {entry.comments ? (
                              <p className="mt-1 text-xs text-gray-700 whitespace-pre-wrap">{entry.comments}</p>
                            ) : null}
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-2 border-t border-gray-200 px-6 py-4">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={isSaving}
                    className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={isSaving}
                    className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {isSaving ? 'Saving…' : 'Save'}
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
