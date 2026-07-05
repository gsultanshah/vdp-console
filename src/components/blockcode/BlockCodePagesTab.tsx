'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardDocumentIcon,
  ArrowTopRightOnSquareIcon,
  PhotoIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import type { BlockCodeContext } from '@/lib/blockcode-hub';
import { blockCodeHubPath } from '@/lib/blockcode-hub';
import { ocrPageHref } from '@/lib/ocr-navigation';
import { fetchUploadsPage } from '@/lib/blockcode-uploads';
import type { UploadImage } from '@/components/constituency/ImageViewerModal';
import ImageViewerModal from '@/components/constituency/ImageViewerModal';

interface BlockCodePagesTabProps {
  context: BlockCodeContext;
}

const PAGE_SIZE_OPTIONS = [25, 50, 100];
const PREVIEW_ROW_COUNT = 5;

function SkeletonRows({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <tr key={i} className="animate-pulse">
          <td className="px-3 py-3"><div className="h-4 w-6 rounded bg-gray-200" /></td>
          <td className="px-3 py-3"><div className="h-4 w-40 rounded bg-gray-200" /></td>
          <td className="px-3 py-3"><div className="h-4 w-16 rounded bg-gray-200" /></td>
          <td className="px-3 py-3"><div className="h-4 w-24 rounded bg-gray-200" /></td>
          <td className="px-3 py-3"><div className="h-8 w-28 rounded bg-gray-200" /></td>
        </tr>
      ))}
    </>
  );
}

export default function BlockCodePagesTab({ context }: BlockCodePagesTabProps) {
  const { blockCode, halkaName } = context;
  const [uploads, setUploads] = useState<UploadImage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [hasPreview, setHasPreview] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const [expectedCount, setExpectedCount] = useState(50);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerPage, setViewerPage] = useState(1);
  const [viewerIndex, setViewerIndex] = useState(0);

  const fetchPage = useCallback(
    async (page: number, size: number) => {
      setIsStreaming(true);
      setHasPreview(false);
      setLoadedCount(0);
      setExpectedCount(size);
      setLoadError(null);
      setUploads([]);

      try {
        await fetchUploadsPage({ blockCode, halkaName }, page, size, {
          onUpload: (upload) => setUploads((current) => [...current, upload]),
          onUploadsUpdate: (all) => setUploads(all),
          onPreviewReady: () => setHasPreview(true),
          onProgress: (loaded, expected) => {
            setLoadedCount(loaded);
            setExpectedCount(expected);
          },
          onDone: (result) => {
            setCurrentPage(result.currentPage);
            setTotalPages(result.totalPages);
            setTotal(result.total);
            setPageSize(result.pageSize);
            setLoadedCount(result.uploads.length);
            setHasPreview(true);
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load pages';
        setLoadError(message);
        toast.error(message);
      } finally {
        setIsStreaming(false);
      }
    },
    [blockCode, halkaName]
  );

  useEffect(() => {
    void fetchPage(1, pageSize);
  }, [fetchPage, pageSize]);

  const rowOffset = (currentPage - 1) * pageSize;
  const isInitialLoad = isStreaming && uploads.length === 0;
  const isLoadingMore = isStreaming && hasPreview;
  const previewSkeletonCount =
    isStreaming && !hasPreview
      ? Math.max(0, Math.min(PREVIEW_ROW_COUNT, expectedCount) - uploads.length)
      : 0;
  const trailingSkeletonCount =
    isLoadingMore && expectedCount > uploads.length
      ? Math.min(3, expectedCount - uploads.length)
      : 0;

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

  const openViewer = (index: number) => {
    setViewerPage(currentPage);
    setViewerIndex(index);
    setViewerOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Uploaded pages</h2>
          <p className="text-sm text-gray-500">
            {isStreaming && total === 0
              ? loadedCount > 0
                ? `Loaded ${loadedCount} of ${expectedCount} on this page`
                : 'Loading pages…'
              : `${total.toLocaleString()} page${total !== 1 ? 's' : ''} · showing ${rowOffset + 1}–${Math.min(rowOffset + uploads.length, total)}`}
          </p>
        </div>
        {isLoadingMore && (
          <div className="w-full max-w-xs sm:w-48">
            <div className="h-1.5 overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-indigo-500 transition-all"
                style={{ width: `${Math.min(100, Math.round((loadedCount / expectedCount) * 100))}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {loadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm text-red-700">{loadError}</p>
          <button
            onClick={() => void fetchPage(currentPage, pageSize)}
            className="mt-3 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Retry
          </button>
        </div>
      ) : isInitialLoad ? (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase text-gray-500">#</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase text-gray-500">File</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase text-gray-500">Status</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase text-gray-500">Uploaded</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody><SkeletonRows count={PREVIEW_ROW_COUNT} /></tbody>
          </table>
        </div>
      ) : uploads.length === 0 ? (
        <p className="py-12 text-center text-sm text-gray-500">No uploaded pages found for this block.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase text-gray-500">#</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase text-gray-500">File</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase text-gray-500">Status</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase text-gray-500">Uploaded</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {uploads.map((upload, index) => (
                  <tr key={upload._id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-500">{rowOffset + index + 1}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-900">{upload.fileName}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-500">{upload.status}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-500">
                      {new Date(upload.uploadedAt).toLocaleDateString()}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-sm">
                      <div className="flex items-center gap-1">
                        <button onClick={() => void copyUrl(upload.url, upload._id)} className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100" title="Copy URL">
                          <ClipboardDocumentIcon className={`h-5 w-5 ${copiedId === upload._id ? 'text-green-600' : ''}`} />
                        </button>
                        <button onClick={() => window.open(upload.url, '_blank')} className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100" title="Open image">
                          <ArrowTopRightOnSquareIcon className="h-5 w-5" />
                        </button>
                        <button onClick={() => openViewer(index)} className="rounded-md p-1.5 text-indigo-600 hover:bg-indigo-50" title="Browse">
                          <PhotoIcon className="h-5 w-5" />
                        </button>
                        <Link
                          href={ocrPageHref(
                            upload._id,
                            blockCodeHubPath(blockCode, halkaName, 'pages')
                          )}
                          className="rounded-md p-1.5 text-emerald-600 hover:bg-emerald-50"
                          title="OCR"
                        >
                          <DocumentTextIcon className="h-5 w-5" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
                {previewSkeletonCount > 0 && <SkeletonRows count={previewSkeletonCount} />}
                {trailingSkeletonCount > 0 && <SkeletonRows count={trailingSkeletonCount} />}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {total > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span>Rows per page</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              disabled={isStreaming}
              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void fetchPage(currentPage - 1, pageSize)}
              disabled={currentPage <= 1 || isStreaming}
              className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm disabled:opacity-50"
            >
              <ChevronLeftIcon className="mr-1 h-4 w-4" /> Previous
            </button>
            <span className="text-sm text-gray-600">Page {currentPage} of {totalPages}</span>
            <button
              onClick={() => void fetchPage(currentPage + 1, pageSize)}
              disabled={currentPage >= totalPages || isStreaming}
              className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Next <ChevronRightIcon className="ml-1 h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <ImageViewerModal
        isOpen={viewerOpen}
        onClose={() => setViewerOpen(false)}
        queryParams={{ blockCode, halkaName }}
        initialPage={viewerPage}
        initialIndex={viewerIndex}
      />
    </div>
  );
}
