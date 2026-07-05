'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  XMarkIcon,
  UserIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { fetchVotersPage, VOTER_PREVIEW_COUNT } from '@/lib/voter-browse';
import type { VoterBrowseQueryParams, VoterBrowseRecord } from '@/lib/voter-browse-types';

interface VotersTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  queryParams: VoterBrowseQueryParams | null;
  onBrowseVoter: (voter: VoterBrowseRecord, page: number, indexInPage: number) => void;
}

const PAGE_SIZE_OPTIONS = [25, 50, 100];
const PREVIEW_ROW_COUNT = VOTER_PREVIEW_COUNT;

function VoterTableSkeletonRows({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <tr key={`skeleton-${index}`} className="animate-pulse">
          <td className="px-3 py-3"><div className="h-4 w-6 rounded bg-gray-200" /></td>
          <td className="px-3 py-3"><div className="h-4 w-28 rounded bg-gray-200" /></td>
          <td className="px-3 py-3"><div className="h-4 w-40 rounded bg-gray-200" /></td>
          <td className="px-3 py-3"><div className="h-4 w-16 rounded bg-gray-200" /></td>
          <td className="px-3 py-3"><div className="h-4 w-12 rounded bg-gray-200" /></td>
          <td className="px-3 py-3"><div className="h-8 w-28 rounded bg-gray-200" /></td>
        </tr>
      ))}
    </>
  );
}

export default function VotersTableModal({
  isOpen,
  onClose,
  title,
  queryParams,
  onBrowseVoter,
}: VotersTableModalProps) {
  const [voters, setVoters] = useState<VoterBrowseRecord[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [hasPreview, setHasPreview] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const [expectedCount, setExpectedCount] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const abortRef = useRef<AbortController | null>(null);

  const fetchPage = useCallback(
    async (page: number, size: number) => {
      if (!queryParams) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsStreaming(true);
      setHasPreview(false);
      setLoadedCount(0);
      setExpectedCount(size);
      setLoadError(null);
      setVoters([]);

      try {
        await fetchVotersPage(
          queryParams,
          page,
          size,
          {
            onMeta: (meta) => {
              setExpectedCount(meta.pageSize);
            },
            onVoter: (voter) => {
              setVoters((current) => [...current, voter]);
            },
            onVotersUpdate: (all) => {
              setVoters(all);
            },
            onPreviewReady: () => {
              setHasPreview(true);
            },
            onProgress: (loaded, expected) => {
              setLoadedCount(loaded);
              setExpectedCount(expected);
            },
            onDone: (result) => {
              setCurrentPage(result.currentPage);
              setTotalPages(result.totalPages);
              setTotal(result.total);
              setPageSize(result.pageSize);
              setLoadedCount(result.voters.length);
              setHasPreview(true);
            },
          },
          controller.signal
        );
      } catch (error) {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : 'Failed to load voters';
        setLoadError(message);
        toast.error(message);
        setVoters([]);
        setTotal(0);
        setTotalPages(1);
      } finally {
        if (abortRef.current === controller) {
          setIsStreaming(false);
        }
      }
    },
    [queryParams]
  );

  useEffect(() => {
    if (!isOpen || !queryParams) return;
    setCurrentPage(1);
    setLoadError(null);
    setHasPreview(false);
    setLoadedCount(0);
    void fetchPage(1, pageSize);
  }, [isOpen, queryParams, fetchPage]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const goToPage = (page: number) => {
    if (page < 1 || page > totalPages || page === currentPage) return;
    void fetchPage(page, pageSize);
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setCurrentPage(1);
    void fetchPage(1, size);
  };

  if (!isOpen) return null;

  const rowOffset = (currentPage - 1) * pageSize;
  const isInitialLoad = isStreaming && voters.length === 0;
  const isLoadingMore = isStreaming && hasPreview;
  const previewSkeletonCount =
    isStreaming && !hasPreview
      ? Math.max(0, Math.min(PREVIEW_ROW_COUNT, expectedCount || pageSize) - voters.length)
      : 0;
  const trailingSkeletonCount =
    isLoadingMore && expectedCount > voters.length
      ? Math.min(3, expectedCount - voters.length)
      : 0;
  const loadProgress =
    expectedCount > 0 ? Math.min(100, Math.round((loadedCount / expectedCount) * 100)) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-500/75 p-4">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-lg bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h3 className="text-lg font-medium text-gray-900">{title}</h3>
            <p className="mt-1 text-sm text-gray-500">
              {isStreaming && total === 0 ? (
                <>
                  {loadedCount > 0 ? (
                    <>
                      Loaded {loadedCount.toLocaleString()} of {expectedCount.toLocaleString()} on this page
                    </>
                  ) : (
                    'Loading first records…'
                  )}
                </>
              ) : (
                <>
                  {total.toLocaleString()} voter{total !== 1 ? 's' : ''}
                  {total > 0 && (
                    <span className="text-gray-400">
                      {' '}
                      · showing {rowOffset + 1}–{Math.min(rowOffset + voters.length, total)}
                    </span>
                  )}
                </>
              )}
            </p>
            {isLoadingMore && (
              <div className="mt-2">
                <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-gray-200">
                  <div
                    className="h-full rounded-full bg-indigo-500 transition-all duration-300 ease-out"
                    style={{ width: `${loadProgress}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  {loadedCount.toLocaleString()} of {expectedCount.toLocaleString()} rows loaded
                </p>
              </div>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-500" aria-label="Close">
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-6 py-4">
          {loadError ? (
            <div className="py-12 text-center">
              <p className="text-sm text-red-600">{loadError}</p>
              <button
                onClick={() => void fetchPage(currentPage, pageSize)}
                className="mt-4 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Retry
              </button>
            </div>
          ) : isInitialLoad ? (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="sticky top-0 bg-gray-50">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">#</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">CNIC</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Name</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Block</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Silsila</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                <VoterTableSkeletonRows count={PREVIEW_ROW_COUNT} />
              </tbody>
            </table>
          ) : !isStreaming && voters.length === 0 ? (
            <div className="py-12 text-center text-gray-500">No voters found</div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="sticky top-0 bg-gray-50">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">#</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">CNIC</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Name</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Block</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Silsila</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {voters.map((voter, index) => (
                  <tr key={voter._id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-500">{rowOffset + index + 1}</td>
                    <td className="whitespace-nowrap px-3 py-3 font-mono text-sm text-gray-900">{voter.cnic}</td>
                    <td className="max-w-xs truncate px-3 py-3 text-sm text-gray-900" dir="rtl">{voter.name}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-700">{voter.blockCode}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-700">{voter.silsilaNo}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-sm">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => onBrowseVoter(voter, currentPage, index)}
                          className="rounded-md p-1.5 text-indigo-600 hover:bg-indigo-50"
                          title="Browse voter"
                        >
                          <UserIcon className="h-5 w-5" />
                        </button>
                        <Link
                          href={`/dashboard/search-voters?cnic=${encodeURIComponent(voter.cnic)}`}
                          className="rounded-md px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                        >
                          Profile
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
                {previewSkeletonCount > 0 && <VoterTableSkeletonRows count={previewSkeletonCount} />}
                {trailingSkeletonCount > 0 && <VoterTableSkeletonRows count={trailingSkeletonCount} />}
              </tbody>
            </table>
          )}
        </div>

        {total > 0 && (
          <div className="flex flex-col gap-3 border-t border-gray-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span>Rows per page</span>
              <select
                value={pageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                className="rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-800"
                disabled={isStreaming}
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage <= 1 || isStreaming}
                className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronLeftIcon className="mr-1 h-4 w-4" />
                Previous
              </button>
              <span className="px-2 text-sm text-gray-600">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage >= totalPages || isStreaming}
                className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
                <ChevronRightIcon className="ml-1 h-4 w-4" />
              </button>
            </div>
          </div>
        )}

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
  );
}
