'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  XMarkIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline';
import VoterRowPreview from '@/components/voters/VoterRowPreview';
import { formatGenderFromCnic } from '@/lib/cnic';
import type {
  PaginatedVotersResponse,
  VoterBrowseQueryParams,
  VoterBrowseRecord,
} from '@/lib/voter-browse-types';

interface VoterBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  queryParams: VoterBrowseQueryParams | null;
  initialPage?: number;
  initialIndex?: number;
}

const DEFAULT_PAGE_SIZE = 50;

function buildQueryString(params: VoterBrowseQueryParams, page: number, limit: number): string {
  const parts = [`page=${page}`, `limit=${limit}`];
  if (params.blockCode) {
    parts.unshift(`blockCode=${encodeURIComponent(params.blockCode)}`);
  } else if (params.halkaName) {
    parts.unshift(`halkaName=${encodeURIComponent(params.halkaName)}`);
  }
  return parts.join('&');
}

export default function VoterBrowserModal({
  isOpen,
  onClose,
  queryParams,
  initialPage = 1,
  initialIndex = 0,
}: VoterBrowserModalProps) {
  const [page, setPage] = useState(initialPage);
  const [indexInPage, setIndexInPage] = useState(initialIndex);
  const [pageVoters, setPageVoters] = useState<VoterBrowseRecord[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [isLoading, setIsLoading] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const current = pageVoters[indexInPage];
  const globalIndex = total === 0 ? 0 : (page - 1) * pageSize + indexInPage + 1;

  const fetchPage = useCallback(
    async (targetPage: number, targetIndex: number | 'last' = 0) => {
      if (!queryParams) return;

      setIsLoading(true);
      setLoadError(null);
      try {
        const response = await fetch(`/api/voters?${buildQueryString(queryParams, targetPage, DEFAULT_PAGE_SIZE)}`);
        if (!response.ok) throw new Error('Failed to fetch voters');

        const data: PaginatedVotersResponse = await response.json();
        if (!data.voters.length) {
          setPageVoters([]);
          setTotal(0);
          setLoadError('No voters found');
          return;
        }

        setPageVoters(data.voters);
        setPage(data.currentPage);
        setTotalPages(data.totalPages);
        setTotal(data.total);
        setPageSize(data.pageSize);
        setIndexInPage(
          targetIndex === 'last' ? data.voters.length - 1 : Math.min(targetIndex, data.voters.length - 1)
        );
      } catch {
        setPageVoters([]);
        setTotal(0);
        setLoadError('Failed to load voters');
      } finally {
        setIsLoading(false);
      }
    },
    [queryParams]
  );

  useEffect(() => {
    if (!isOpen || !queryParams) return;
    void fetchPage(initialPage, initialIndex);
  }, [isOpen, queryParams, initialPage, initialIndex, fetchPage]);

  const goPrev = useCallback(async () => {
    if (isNavigating || isLoading) return;

    if (indexInPage > 0) {
      setIndexInPage((value) => value - 1);
      return;
    }

    if (page > 1) {
      setIsNavigating(true);
      try {
        await fetchPage(page - 1, 'last');
      } finally {
        setIsNavigating(false);
      }
    }
  }, [isNavigating, isLoading, indexInPage, page, fetchPage]);

  const goNext = useCallback(async () => {
    if (isNavigating || isLoading) return;

    if (indexInPage < pageVoters.length - 1) {
      setIndexInPage((value) => value + 1);
      return;
    }

    if (page < totalPages) {
      setIsNavigating(true);
      try {
        await fetchPage(page + 1, 0);
      } finally {
        setIsNavigating(false);
      }
    }
  }, [isNavigating, isLoading, indexInPage, pageVoters.length, page, totalPages, fetchPage]);

  const hasPrev = globalIndex > 1;
  const hasNext = globalIndex < total;

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        void goPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        void goNext();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, goPrev, goNext, onClose]);

  if (!isOpen) return null;

  if (isLoading && !current) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/90">
        <p className="text-white">Loading voters...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/90" onClick={onClose}>
        <div className="rounded-lg bg-white px-6 py-4 text-center shadow-xl" onClick={(e) => e.stopPropagation()}>
          <p className="text-sm text-gray-700">{loadError}</p>
          <button
            onClick={onClose}
            className="mt-4 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  if (!current) return null;

  const gender = formatGenderFromCnic(current.cnic);
  const hasRowPreview =
    Boolean(current.imageUrl) &&
    current.rowY != null &&
    current.rowHeight != null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/90 p-4" onClick={onClose}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute top-4 right-4 z-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        aria-label="Close"
      >
        <XMarkIcon className="h-6 w-6" />
      </button>

      <div
        className="relative flex h-full w-full max-w-5xl flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => void goPrev()}
          disabled={!hasPrev || isLoading || isNavigating}
          className="absolute left-0 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="Previous voter"
        >
          <ChevronLeftIcon className="h-8 w-8" />
        </button>

        <div className="mx-auto flex h-full w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
          <div className="border-b border-gray-200 px-6 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1 text-right" dir="rtl">
                <h3 className="text-xl font-bold text-gray-900">{current.name}</h3>
                {current.gharanaNo && <p className="mt-1 text-sm text-gray-600">{current.gharanaNo}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {current.imageUrl && (
                  <a
                    href={current.imageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
                  >
                    Full page
                    <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                  </a>
                )}
                <Link
                  href={`/dashboard/search-voters?cnic=${encodeURIComponent(current.cnic)}`}
                  className="rounded-md border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  Search profile
                </Link>
              </div>
            </div>

            <p className="mt-3 text-sm text-gray-500">
              Voter {globalIndex.toLocaleString()} of {total.toLocaleString()}
              {totalPages > 1 && ` · page ${page} of ${totalPages}`}
              {(isLoading || isNavigating) && ' · loading...'}
            </p>

            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <div>
                <dt className="text-xs font-medium uppercase text-gray-500">CNIC</dt>
                <dd className="mt-1 font-mono text-sm text-gray-900">{current.cnic}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-gray-500">Halka</dt>
                <dd className="mt-1 text-sm text-gray-900">{current.halkaName}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-gray-500">Block</dt>
                <dd className="mt-1 text-sm text-gray-900">{current.blockCode}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-gray-500">Silsila</dt>
                <dd className="mt-1 text-sm text-gray-900">{current.silsilaNo}</dd>
              </div>
              {gender && (
                <div>
                  <dt className="text-xs font-medium uppercase text-gray-500">Gender</dt>
                  <dd className="mt-1 text-sm text-gray-900">{gender}</dd>
                </div>
              )}
              {current.fatherName && (
                <div>
                  <dt className="text-xs font-medium uppercase text-gray-500">Father</dt>
                  <dd className="mt-1 text-sm text-gray-900" dir="rtl">{current.fatherName}</dd>
                </div>
              )}
              {current.profession && (
                <div>
                  <dt className="text-xs font-medium uppercase text-gray-500">Profession</dt>
                  <dd className="mt-1 text-sm text-gray-900" dir="rtl">{current.profession}</dd>
                </div>
              )}
              {current.fileName && (
                <div className="col-span-2">
                  <dt className="text-xs font-medium uppercase text-gray-500">Source page</dt>
                  <dd className="mt-1 text-sm text-gray-900">{current.fileName}</dd>
                </div>
              )}
            </dl>

            {current.address && (
              <p className="mt-3 text-sm text-gray-700" dir="rtl">
                {current.address}
              </p>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {hasRowPreview ? (
              <VoterRowPreview
                imageUrl={current.imageUrl!}
                rowY={current.rowY!}
                rowHeight={current.rowHeight!}
                reproduction={current.reproduction}
                label={current.name}
              />
            ) : (
              <p className="text-sm text-gray-500">No row preview available for this voter.</p>
            )}
          </div>

          <div className="flex items-center justify-center gap-3 border-t border-gray-200 px-6 py-4">
            <button
              onClick={() => void goPrev()}
              disabled={!hasPrev || isLoading || isNavigating}
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronLeftIcon className="h-4 w-4" />
              Previous
            </button>
            <button
              onClick={() => void goNext()}
              disabled={!hasNext || isLoading || isNavigating}
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        <button
          onClick={() => void goNext()}
          disabled={!hasNext || isLoading || isNavigating}
          className="absolute right-0 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="Next voter"
        >
          <ChevronRightIcon className="h-8 w-8" />
        </button>
      </div>
    </div>
  );
}
