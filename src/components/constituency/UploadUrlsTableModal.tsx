'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  PhotoIcon,
  XMarkIcon,
  ClipboardDocumentIcon,
  ArrowTopRightOnSquareIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import type { UploadImage } from './ImageViewerModal';

export interface UploadQueryParams {
  blockCode?: string;
  halkaName?: string;
}

export interface PaginatedUploadsResponse {
  uploads: UploadImage[];
  currentPage: number;
  totalPages: number;
  total: number;
  pageSize: number;
}

interface UploadUrlsTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  queryParams: UploadQueryParams | null;
  onViewImage: (upload: UploadImage, pageUploads: UploadImage[], indexInPage: number) => void;
}

const PAGE_SIZE_OPTIONS = [25, 50, 100];

export default function UploadUrlsTableModal({
  isOpen,
  onClose,
  title,
  queryParams,
  onViewImage,
}: UploadUrlsTableModalProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [uploads, setUploads] = useState<UploadImage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(50);

  const fetchPage = useCallback(async (page: number, size: number) => {
    if (!queryParams) return;

    const baseQuery = queryParams.blockCode
      ? `blockCode=${encodeURIComponent(queryParams.blockCode)}`
      : `halkaName=${encodeURIComponent(queryParams.halkaName!)}`;

    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/blockcodes?${baseQuery}&page=${page}&limit=${size}`
      );
      if (!response.ok) throw new Error('Failed to fetch uploads');

      const data: PaginatedUploadsResponse = await response.json();
      setUploads(data.uploads);
      setCurrentPage(data.currentPage);
      setTotalPages(data.totalPages);
      setTotal(data.total);
      setPageSize(data.pageSize);
    } catch {
      toast.error('Failed to load uploads');
      setUploads([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      setIsLoading(false);
    }
  }, [queryParams]);

  useEffect(() => {
    if (!isOpen || !queryParams) return;
    fetchPage(1, pageSize);
  }, [isOpen, queryParams, fetchPage]);

  const goToPage = (page: number) => {
    if (page < 1 || page > totalPages || page === currentPage) return;
    fetchPage(page, pageSize);
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setCurrentPage(1);
    fetchPage(1, size);
  };

  if (!isOpen) return null;

  const copyUrl = async (url: string, id: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      toast.success('URL copied');
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error('Failed to copy URL');
    }
  };

  const openInNewTab = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const rowOffset = (currentPage - 1) * pageSize;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-500/75 p-4">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-lg bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h3 className="text-lg font-medium text-gray-900">{title}</h3>
            <p className="mt-1 text-sm text-gray-500">
              {total.toLocaleString()} uploaded image{total !== 1 ? 's' : ''}
              {total > 0 && (
                <span className="text-gray-400">
                  {' '}· showing {rowOffset + 1}–{Math.min(rowOffset + uploads.length, total)}
                </span>
              )}
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
            <div className="py-12 text-center text-gray-500">Loading uploads...</div>
          ) : uploads.length === 0 ? (
            <div className="py-12 text-center text-gray-500">No uploaded images found</div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">#</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Block Code</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">File Name</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Uploaded</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {uploads.map((upload, index) => (
                  <tr key={upload._id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-500">{rowOffset + index + 1}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-sm font-medium text-gray-900">{upload.blockCode}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-700">{upload.fileName}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-500">{upload.status}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-500">
                      {new Date(upload.uploadedAt).toLocaleDateString()}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-sm">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => copyUrl(upload.url, upload._id)}
                          className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100"
                          title="Copy image URL"
                        >
                          <ClipboardDocumentIcon className={`h-5 w-5 ${copiedId === upload._id ? 'text-green-600' : ''}`} />
                        </button>
                        <button
                          onClick={() => openInNewTab(upload.url)}
                          className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100"
                          title="Open image in new tab"
                        >
                          <ArrowTopRightOnSquareIcon className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => onViewImage(upload, uploads, index)}
                          className="rounded-md p-1.5 text-indigo-600 hover:bg-indigo-50"
                          title="View image"
                        >
                          <PhotoIcon className="h-5 w-5" />
                        </button>
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
                  <option key={size} value={size}>{size}</option>
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
