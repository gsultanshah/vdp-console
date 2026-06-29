'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeftIcon, ChevronRightIcon, XMarkIcon } from '@heroicons/react/24/outline';
import type { UploadQueryParams } from './UploadUrlsTableModal';

export interface UploadImage {
  _id: string;
  blockCode: string;
  fileName: string;
  url: string;
  tag?: string;
  halkaName: string;
  gender: string;
  religion: string;
  status: string;
  uploadedAt: string;
}

interface PaginatedUploadsResponse {
  uploads: UploadImage[];
  currentPage: number;
  totalPages: number;
  total: number;
  pageSize: number;
}

interface ImageViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Static list mode (legacy) */
  images?: UploadImage[];
  currentIndex?: number;
  onIndexChange?: (index: number) => void;
  /** Server-paginated browse mode */
  queryParams?: UploadQueryParams | null;
  initialPage?: number;
  initialIndex?: number;
}

const DEFAULT_PAGE_SIZE = 50;

export default function ImageViewerModal({
  isOpen,
  onClose,
  images = [],
  currentIndex = 0,
  onIndexChange,
  queryParams = null,
  initialPage = 1,
  initialIndex = 0,
}: ImageViewerModalProps) {
  const paginatedMode = Boolean(queryParams);

  const [page, setPage] = useState(initialPage);
  const [indexInPage, setIndexInPage] = useState(initialIndex);
  const [pageUploads, setPageUploads] = useState<UploadImage[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [isLoading, setIsLoading] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const staticCurrent = images[currentIndex];
  const paginatedCurrent = pageUploads[indexInPage];
  const current = paginatedMode ? paginatedCurrent : staticCurrent;

  const globalIndex = paginatedMode
    ? total === 0
      ? 0
      : (page - 1) * pageSize + indexInPage + 1
    : currentIndex + 1;

  const globalTotal = paginatedMode ? total : images.length;

  const fetchPage = useCallback(
    async (targetPage: number, targetIndex: number | 'last' = 0) => {
      if (!queryParams) return;

      const baseQuery = queryParams.blockCode
        ? `blockCode=${encodeURIComponent(queryParams.blockCode)}`
        : `halkaName=${encodeURIComponent(queryParams.halkaName!)}`;

      setIsLoading(true);
      setLoadError(null);
      try {
        const response = await fetch(
          `/api/blockcodes?${baseQuery}&page=${targetPage}&limit=${DEFAULT_PAGE_SIZE}`
        );
        if (!response.ok) throw new Error('Failed to fetch uploads');

        const data: PaginatedUploadsResponse = await response.json();
        if (!data.uploads.length) {
          setPageUploads([]);
          setTotal(0);
          setLoadError('No uploaded images found');
          return;
        }

        setPageUploads(data.uploads);
        setPage(data.currentPage);
        setTotalPages(data.totalPages);
        setTotal(data.total);
        setPageSize(data.pageSize);
        setIndexInPage(
          targetIndex === 'last' ? data.uploads.length - 1 : Math.min(targetIndex, data.uploads.length - 1)
        );
      } catch {
        setPageUploads([]);
        setTotal(0);
        setLoadError('Failed to load uploads');
      } finally {
        setIsLoading(false);
      }
    },
    [queryParams]
  );

  useEffect(() => {
    if (!isOpen || !paginatedMode || !queryParams) return;
    void fetchPage(initialPage, initialIndex);
  }, [isOpen, paginatedMode, queryParams, initialPage, initialIndex, fetchPage]);

  const goPrev = useCallback(async () => {
    if (paginatedMode) {
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
      return;
    }

    if (currentIndex > 0) {
      onIndexChange?.(currentIndex - 1);
    }
  }, [
    paginatedMode,
    isNavigating,
    isLoading,
    indexInPage,
    page,
    pageSize,
    fetchPage,
    currentIndex,
    onIndexChange,
  ]);

  const goNext = useCallback(async () => {
    if (paginatedMode) {
      if (isNavigating || isLoading) return;

      if (indexInPage < pageUploads.length - 1) {
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
      return;
    }

    if (currentIndex < images.length - 1) {
      onIndexChange?.(currentIndex + 1);
    }
  }, [
    paginatedMode,
    isNavigating,
    isLoading,
    indexInPage,
    pageUploads.length,
    page,
    totalPages,
    fetchPage,
    currentIndex,
    images.length,
    onIndexChange,
  ]);

  const hasPrev = paginatedMode ? globalIndex > 1 : currentIndex > 0;
  const hasNext = paginatedMode ? globalIndex < total : currentIndex < images.length - 1;

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

  if (paginatedMode && isLoading && !current) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
        <p className="text-white">Loading uploads...</p>
      </div>
    );
  }

  if (paginatedMode && loadError) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
        onClick={onClose}
      >
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
      onClick={onClose}
    >
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
        className="relative flex h-full w-full max-w-6xl flex-col items-center justify-center px-16 py-12"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => void goPrev()}
          disabled={!hasPrev || isLoading || isNavigating}
          className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="Previous image"
        >
          <ChevronLeftIcon className="h-8 w-8" />
        </button>

        <div className="flex max-h-[75vh] max-w-full flex-col items-center">
          <img
            src={current.url}
            alt={current.fileName}
            className="max-h-[65vh] max-w-full object-contain"
          />
          <div className="mt-4 w-full max-w-2xl rounded-lg bg-white/10 px-4 py-3 text-center text-white">
            <p className="text-sm font-medium">
              {globalIndex.toLocaleString()} / {globalTotal.toLocaleString()}
              {paginatedMode && totalPages > 1 && (
                <span className="text-white/60"> · page {page} of {totalPages}</span>
              )}
            </p>
            <p className="mt-1 text-sm text-white/80">{current.fileName}</p>
            <p className="mt-1 text-xs text-white/60">
              Block {current.blockCode} · {current.gender} · {current.religion} · {current.status}
            </p>
            {(isLoading || isNavigating) && (
              <p className="mt-2 text-xs text-white/50">Loading page...</p>
            )}
            <Link
              href={`/dashboard/blockcodes/${current._id}/ocr`}
              className="mt-3 inline-block rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
              onClick={(e) => e.stopPropagation()}
            >
              View OCR reproduction
            </Link>
          </div>
        </div>

        <button
          onClick={() => void goNext()}
          disabled={!hasNext || isLoading || isNavigating}
          className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="Next image"
        >
          <ChevronRightIcon className="h-8 w-8" />
        </button>

        <div className="absolute bottom-6 flex items-center gap-3">
          <button
            onClick={() => void goPrev()}
            disabled={!hasPrev || isLoading || isNavigating}
            className="inline-flex items-center gap-1 rounded-md bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronLeftIcon className="h-4 w-4" />
            Previous
          </button>
          <button
            onClick={() => void goNext()}
            disabled={!hasNext || isLoading || isNavigating}
            className="inline-flex items-center gap-1 rounded-md bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30"
          >
            Next
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
