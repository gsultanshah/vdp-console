'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  XMarkIcon,
  UserIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import type {
  PaginatedVotersResponse,
  VoterBrowseQueryParams,
  VoterBrowseRecord,
} from '@/lib/voter-browse-types';

interface VotersTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  queryParams: VoterBrowseQueryParams | null;
  onBrowseVoter: (voter: VoterBrowseRecord, page: number, indexInPage: number) => void;
}

const PAGE_SIZE_OPTIONS = [25, 50, 100];

function buildQueryString(params: VoterBrowseQueryParams, page: number, limit: number): string {
  const parts = [`page=${page}`, `limit=${limit}`];
  if (params.blockCode) {
    parts.unshift(`blockCode=${encodeURIComponent(params.blockCode)}`);
  } else if (params.halkaName) {
    parts.unshift(`halkaName=${encodeURIComponent(params.halkaName)}`);
  }
  return parts.join('&');
}

export default function VotersTableModal({
  isOpen,
  onClose,
  title,
  queryParams,
  onBrowseVoter,
}: VotersTableModalProps) {
  const [voters, setVoters] = useState<VoterBrowseRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(50);

  const fetchPage = useCallback(
    async (page: number, size: number) => {
      if (!queryParams) return;

      setIsLoading(true);
      try {
        const response = await fetch(`/api/voters?${buildQueryString(queryParams, page, size)}`);
        if (!response.ok) throw new Error('Failed to fetch voters');

        const data: PaginatedVotersResponse = await response.json();
        setVoters(data.voters);
        setCurrentPage(data.currentPage);
        setTotalPages(data.totalPages);
        setTotal(data.total);
        setPageSize(data.pageSize);
      } catch {
        toast.error('Failed to load voters');
        setVoters([]);
        setTotal(0);
        setTotalPages(1);
      } finally {
        setIsLoading(false);
      }
    },
    [queryParams]
  );

  useEffect(() => {
    if (!isOpen || !queryParams) return;
    void fetchPage(1, pageSize);
  }, [isOpen, queryParams, fetchPage]);

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-500/75 p-4">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-lg bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h3 className="text-lg font-medium text-gray-900">{title}</h3>
            <p className="mt-1 text-sm text-gray-500">
              {total.toLocaleString()} voter{total !== 1 ? 's' : ''}
              {total > 0 && (
                <span className="text-gray-400">
                  {' '}
                  · showing {rowOffset + 1}–{Math.min(rowOffset + voters.length, total)}
                </span>
              )}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-500" aria-label="Close">
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-6 py-4">
          {isLoading ? (
            <div className="py-12 text-center text-gray-500">Loading voters...</div>
          ) : voters.length === 0 ? (
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
                disabled={isLoading}
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
                disabled={currentPage <= 1 || isLoading}
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
                disabled={currentPage >= totalPages || isLoading}
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
