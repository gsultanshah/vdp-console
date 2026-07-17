'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowPathIcon, XMarkIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

interface DeletedBlockCodeItem {
  constituencyId: string;
  halkaName: string;
  blockCode: string;
  deletedAt: string;
  deletedBy?: string | null;
  deletedByName?: string | null;
}

interface RecoverBlockCodesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function RecoverBlockCodesModal({ isOpen, onClose }: RecoverBlockCodesModalProps) {
  const [items, setItems] = useState<DeletedBlockCodeItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [restoringKey, setRestoringKey] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<DeletedBlockCodeItem | null>(null);

  const itemKey = (item: DeletedBlockCodeItem) => `${item.halkaName}:${item.blockCode}`;

  const fetchDeleted = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/constituency/block-codes/recover');
      const data = (await response.json()) as { items?: DeletedBlockCodeItem[]; error?: string };
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch');
      }
      setItems(data.items ?? []);
    } catch {
      toast.error('Failed to load deleted block codes');
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      void fetchDeleted();
    }
  }, [isOpen, fetchDeleted]);

  const handleRestore = async () => {
    if (!confirmRestore) return;
    const key = itemKey(confirmRestore);
    setRestoringKey(key);
    try {
      const response = await fetch('/api/constituency/block-codes/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          halkaName: confirmRestore.halkaName,
          blockCode: confirmRestore.blockCode,
        }),
      });
      const data = (await response.json()) as { error?: string; blockCode?: string };
      if (!response.ok) {
        throw new Error(data.error || 'Failed to restore');
      }
      setItems((prev) => prev.filter((item) => itemKey(item) !== key));
      toast.success(`Block ${confirmRestore.blockCode} restored to ${confirmRestore.halkaName}`);
      setConfirmRestore(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to restore block code');
    } finally {
      setRestoringKey(null);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-500/75 p-4">
        <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-lg bg-white shadow-xl">
          <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900">Recover Block Codes</h3>
              <p className="mt-1 text-sm text-gray-500">
                Soft-deleted block codes are hidden from active lists. Admins can restore them here.
              </p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-500" aria-label="Close">
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          <div className="flex-1 overflow-auto px-6 py-4">
            {isLoading ? (
              <div className="py-12 text-center text-gray-500">Loading deleted block codes…</div>
            ) : items.length === 0 ? (
              <div className="py-12 text-center text-gray-500">No deleted block codes found</div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="sticky top-0 bg-gray-50">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Halka
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Block Code
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Deleted At
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Deleted By
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {items.map((item) => {
                    const key = itemKey(item);
                    return (
                      <tr key={key} className="hover:bg-gray-50">
                        <td className="whitespace-nowrap px-3 py-3 text-sm font-medium text-gray-900">
                          {item.halkaName}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 font-mono text-sm text-gray-800">
                          {item.blockCode}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-500">
                          {new Date(item.deletedAt).toLocaleString()}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-500">
                          {item.deletedByName || item.deletedBy || '—'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-sm">
                          <button
                            type="button"
                            onClick={() => setConfirmRestore(item)}
                            disabled={restoringKey === key}
                            className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                          >
                            <ArrowPathIcon className="h-4 w-4" />
                            {restoringKey === key ? 'Restoring…' : 'Restore'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="border-t border-gray-200 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {confirmRestore && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-500/75 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-medium text-gray-900">Restore block code?</h3>
            <p className="mt-2 text-sm text-gray-600">
              Restore <strong className="font-mono">{confirmRestore.blockCode}</strong> to{' '}
              <strong>{confirmRestore.halkaName}</strong>? It will reappear in the constituency block
              codes table and other active lists. Existing voters and pages for this code are unchanged.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmRestore(null)}
                disabled={Boolean(restoringKey)}
                className="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleRestore()}
                disabled={Boolean(restoringKey)}
                className="flex-1 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {restoringKey ? 'Restoring…' : 'Restore'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
