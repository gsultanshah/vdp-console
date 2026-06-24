'use client';

import { useState, useEffect, useCallback } from 'react';
import { XMarkIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

interface DeletedConstituency {
  _id: string;
  halkaName: string;
  totalVoters: number;
  blockCodes: string[];
  status?: 'active' | 'inactive';
  deletedAt: string;
  lastUpdated: string;
}

interface RecoverConstituenciesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function RecoverConstituenciesModal({
  isOpen,
  onClose,
}: RecoverConstituenciesModalProps) {
  const [constituencies, setConstituencies] = useState<DeletedConstituency[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<DeletedConstituency | null>(null);

  const fetchDeleted = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/constituency/recover');
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setConstituencies(data);
    } catch {
      toast.error('Failed to load deleted constituencies');
      setConstituencies([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchDeleted();
    }
  }, [isOpen, fetchDeleted]);

  const handleRestore = async () => {
    if (!confirmRestore) return;

    setRestoringId(confirmRestore._id);
    try {
      const response = await fetch('/api/constituency/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: confirmRestore._id }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to restore');
      }

      const data = await response.json();
      setConstituencies((prev) => prev.filter((c) => c._id !== confirmRestore._id));

      if (data.renamed && data.originalName) {
        toast.success(
          `Restored as ${data.constituency.halkaName} (${data.originalName} was taken)`,
          { duration: 6000 }
        );
      } else {
        toast.success(`${data.constituency.halkaName} restored successfully`);
      }
      setConfirmRestore(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to restore constituency');
    } finally {
      setRestoringId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-500/75 p-4">
        <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-lg bg-white shadow-xl">
          <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900">Recover Constituencies</h3>
              <p className="mt-1 text-sm text-gray-500">
                Deleted constituencies can be restored to the main list.
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500"
              aria-label="Close"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          <div className="flex-1 overflow-auto px-6 py-4">
            {isLoading ? (
              <div className="py-12 text-center text-gray-500">Loading deleted constituencies...</div>
            ) : constituencies.length === 0 ? (
              <div className="py-12 text-center text-gray-500">No deleted constituencies found</div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Halka Name</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Block Codes</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Deleted At</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {constituencies.map((constituency) => (
                    <tr key={constituency._id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-3 py-3 text-sm font-medium text-gray-900">
                        {constituency.halkaName}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-500">
                        {constituency.blockCodes?.length ?? 0}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-500 capitalize">
                        {constituency.status ?? 'active'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-500">
                        {new Date(constituency.deletedAt).toLocaleString()}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-sm">
                        <button
                          onClick={() => setConfirmRestore(constituency)}
                          disabled={restoringId === constituency._id}
                          className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                          <ArrowPathIcon className="h-4 w-4" />
                          {restoringId === constituency._id ? 'Restoring...' : 'Restore'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="border-t border-gray-200 px-6 py-4">
            <button
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
            <h3 className="text-lg font-medium text-gray-900">Restore constituency?</h3>
            <p className="mt-2 text-sm text-gray-600">
              Restore <strong>{confirmRestore.halkaName}</strong>? It will reappear in the Constituencies list
              {confirmRestore.status === 'inactive' ? ' as inactive' : ''}.
              If another constituency already uses this name, the restored one will be renamed with a{' '}
              <strong>-1</strong>, <strong>-2</strong>, etc. suffix.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setConfirmRestore(null)}
                disabled={!!restoringId}
                className="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRestore}
                disabled={!!restoringId}
                className="flex-1 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {restoringId ? 'Restoring...' : 'Restore'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
