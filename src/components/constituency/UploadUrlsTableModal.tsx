'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  PhotoIcon,
  XMarkIcon,
  ClipboardDocumentIcon,
  ArrowTopRightOnSquareIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DocumentTextIcon,
  ArrowUpTrayIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import type { UploadImage } from './ImageViewerModal';
import { fetchUploadsPage } from '@/lib/blockcode-uploads';
import { fetchJson } from '@/lib/fetch-json';

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
  onViewImage: (
    upload: UploadImage,
    pageUploads: UploadImage[],
    indexInPage: number,
    page: number
  ) => void;
  onUploaded?: (upload: UploadImage) => void;
}

const PAGE_SIZE_OPTIONS = [25, 50, 100];
const PREVIEW_ROW_COUNT = 5;

function UploadTableSkeletonRows({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <tr key={`skeleton-${index}`} className="animate-pulse">
          <td className="px-3 py-3"><div className="h-4 w-6 rounded bg-gray-200" /></td>
          <td className="px-3 py-3"><div className="h-4 w-20 rounded bg-gray-200" /></td>
          <td className="px-3 py-3"><div className="h-4 w-40 rounded bg-gray-200" /></td>
          <td className="px-3 py-3"><div className="h-4 w-16 rounded bg-gray-200" /></td>
          <td className="px-3 py-3"><div className="h-4 w-24 rounded bg-gray-200" /></td>
          <td className="px-3 py-3"><div className="h-8 w-28 rounded bg-gray-200" /></td>
        </tr>
      ))}
    </>
  );
}

interface BatchProgress {
  phase: 'idle' | 'uploading' | 'processing';
  current: number;
  total: number;
  currentFileName: string;
  uploadedCount: number;
  uploadErrors: number;
  created: number;
  enriched: number;
  unchanged: number;
  processErrors: number;
  ocrRun: number;
  lastError: string;
}

const IDLE_BATCH_PROGRESS: BatchProgress = {
  phase: 'idle',
  current: 0,
  total: 0,
  currentFileName: '',
  uploadedCount: 0,
  uploadErrors: 0,
  created: 0,
  enriched: 0,
  unchanged: 0,
  processErrors: 0,
  ocrRun: 0,
  lastError: '',
};

export default function UploadUrlsTableModal({
  isOpen,
  onClose,
  title,
  queryParams,
  onViewImage,
  onUploaded,
}: UploadUrlsTableModalProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [uploads, setUploads] = useState<UploadImage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [hasPreview, setHasPreview] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const [expectedCount, setExpectedCount] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadTag, setUploadTag] = useState('page');
  const [uploadGender, setUploadGender] = useState<'male' | 'female'>('male');
  const [uploadReligion, setUploadReligion] = useState<'muslim' | 'qadiani'>('muslim');
  const [recentUploadedPages, setRecentUploadedPages] = useState<UploadImage[]>([]);
  const [batchProgress, setBatchProgress] = useState<BatchProgress>(IDLE_BATCH_PROGRESS);

  const isBusy = batchProgress.phase !== 'idle';

  const fetchPage = useCallback(async (page: number, size: number) => {
    if (!queryParams) return;

    setIsStreaming(true);
    setHasPreview(false);
    setLoadedCount(0);
    setExpectedCount(size);
    setLoadError(null);
    setUploads([]);

    try {
      await fetchUploadsPage(queryParams, page, size, {
        onMeta: (meta) => {
          setExpectedCount(meta.pageSize);
        },
        onUpload: (upload) => {
          setUploads((current) => [...current, upload]);
        },
        onUploadsUpdate: (all) => {
          setUploads(all);
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
          setLoadedCount(result.uploads.length);
          setHasPreview(true);
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load uploads';
      setLoadError(message);
      toast.error(message);
      setUploads([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      setIsStreaming(false);
    }
  }, [queryParams]);

  useEffect(() => {
    if (!isOpen || !queryParams) return;
    setUploadFiles([]);
    setUploadTag('page');
    setUploadGender('male');
    setUploadReligion('muslim');
    setRecentUploadedPages([]);
    setBatchProgress(IDLE_BATCH_PROGRESS);
    setLoadError(null);
    setHasPreview(false);
    setLoadedCount(0);
    setCurrentPage(1);
    fetchPage(1, pageSize);
  }, [isOpen, queryParams, fetchPage]);

  const blockCode = queryParams?.blockCode;
  const halkaName =
    queryParams?.halkaName ?? uploads[0]?.halkaName ?? recentUploadedPages[0]?.halkaName;
  const canQuickUpload = Boolean(blockCode && halkaName);

  const uploadSingleFile = async (file: File): Promise<UploadImage> => {
    if (!blockCode || !halkaName) {
      throw new Error('Block code and constituency are required to upload.');
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('blockCode', blockCode);
    formData.append('halkaName', halkaName);
    formData.append('tag', uploadTag);
    formData.append('gender', uploadGender);
    formData.append('religion', uploadReligion);

    const response = await fetch('/api/blockcodes/upload-page', {
      method: 'POST',
      body: formData,
    });
    const data: { upload?: UploadImage; error?: string } = await response.json();

    if (!response.ok || !data.upload) {
      throw new Error(data.error || 'Upload failed');
    }

    return data.upload;
  };

  const uploadSelectedFiles = async (): Promise<UploadImage[]> => {
    if (!blockCode || !halkaName) {
      toast.error('Block code and constituency are required to upload.');
      return [];
    }
    if (!uploadFiles.length) {
      toast.error('Select one or more page images first.');
      return [];
    }

    const totalFiles = uploadFiles.length;
    const uploadedPages: UploadImage[] = [];
    let uploadErrors = 0;
    let lastError = '';

    setBatchProgress({
      ...IDLE_BATCH_PROGRESS,
      phase: 'uploading',
      total: totalFiles,
      currentFileName: uploadFiles[0].name,
    });

    for (let index = 0; index < uploadFiles.length; index += 1) {
      const file = uploadFiles[index];

      setBatchProgress((prev) => ({
        ...prev,
        phase: 'uploading',
        current: index,
        total: totalFiles,
        currentFileName: file.name,
        uploadedCount: uploadedPages.length,
        uploadErrors,
        lastError: '',
      }));

      try {
        const upload = await uploadSingleFile(file);
        uploadedPages.push(upload);
      } catch (error) {
        uploadErrors += 1;
        lastError = error instanceof Error ? error.message : 'Upload failed';
      }

      setBatchProgress((prev) => ({
        ...prev,
        current: index + 1,
        uploadedCount: uploadedPages.length,
        uploadErrors,
        lastError,
      }));
    }

    setRecentUploadedPages(uploadedPages);
    setUploadFiles([]);

    if (uploadedPages.length) {
      onUploaded?.(uploadedPages[uploadedPages.length - 1]);
      await fetchPage(1, pageSize);
    }

    setBatchProgress((prev) => ({
      ...prev,
      phase: 'idle',
      currentFileName: '',
    }));

    if (uploadedPages.length === totalFiles) {
      toast.success(`Uploaded ${uploadedPages.length} page${uploadedPages.length === 1 ? '' : 's'}`);
    } else if (uploadedPages.length > 0) {
      toast.error(`Uploaded ${uploadedPages.length} of ${totalFiles} pages`);
    } else {
      toast.error('All uploads failed');
    }

    return uploadedPages;
  };

  const processUploadedPages = async (pages: UploadImage[]) => {
    if (!pages.length) {
      toast.error('Upload pages first.');
      return;
    }

    let created = 0;
    let enriched = 0;
    let unchanged = 0;
    let processErrors = 0;
    let ocrRun = 0;
    let lastError = '';

    setBatchProgress({
      ...IDLE_BATCH_PROGRESS,
      phase: 'processing',
      total: pages.length,
      currentFileName: pages[0].fileName,
    });

    for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index];

      setBatchProgress((prev) => ({
        ...prev,
        phase: 'processing',
        current: index,
        total: pages.length,
        currentFileName: page.fileName,
        created,
        enriched,
        unchanged,
        processErrors,
        ocrRun,
        lastError: '',
      }));

      try {
        const { response, data } = await fetchJson<{
          details?: string;
          error?: string;
          enrich?: {
            created?: number;
            enriched?: number;
            unchanged?: number;
            errors?: number;
          };
          ocr_skipped?: boolean;
        }>(`/api/blockcodes/process-enrich/?page_id=${encodeURIComponent(page._id)}`);

        if (!response.ok) {
          throw new Error(data.details || data.error || 'Processing failed');
        }

        created += data.enrich?.created ?? 0;
        enriched += data.enrich?.enriched ?? 0;
        unchanged += data.enrich?.unchanged ?? 0;
        processErrors += data.enrich?.errors ?? 0;
        if (!data.ocr_skipped) {
          ocrRun += 1;
        }
      } catch (error) {
        processErrors += 1;
        lastError = error instanceof Error ? error.message : 'Processing failed';
      }

      setBatchProgress({
        phase: 'processing',
        current: index + 1,
        total: pages.length,
        currentFileName: page.fileName,
        uploadedCount: pages.length,
        uploadErrors: 0,
        created,
        enriched,
        unchanged,
        processErrors,
        ocrRun,
        lastError,
      });
    }

    onUploaded?.(pages[pages.length - 1]);

    setBatchProgress((prev) => ({
      ...prev,
      phase: 'idle',
      currentFileName: '',
    }));

    toast.success(
      `Processed ${pages.length} page${pages.length === 1 ? '' : 's'} — ${created} created, ${enriched} enriched, ${unchanged} unchanged, ${ocrRun} OCR run, ${processErrors} errors`
    );
  };

  const handleQuickUpload = async () => {
    await uploadSelectedFiles();
  };

  const handleProcessUploadedPages = async () => {
    await processUploadedPages(recentUploadedPages);
  };

  const handleUploadAndProcessAll = async () => {
    const uploadedPages = await uploadSelectedFiles();
    if (uploadedPages.length) {
      await processUploadedPages(uploadedPages);
    }
  };

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
  const isInitialLoad = isStreaming && uploads.length === 0;
  const isLoadingMore = isStreaming && hasPreview;
  const previewSkeletonCount =
    isStreaming && !hasPreview
      ? Math.max(0, Math.min(PREVIEW_ROW_COUNT, expectedCount || pageSize) - uploads.length)
      : 0;
  const trailingSkeletonCount =
    isLoadingMore && expectedCount > uploads.length
      ? Math.min(3, expectedCount - uploads.length)
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
                  {total.toLocaleString()} uploaded image{total !== 1 ? 's' : ''}
                  {total > 0 && (
                    <span className="text-gray-400">
                      {' '}· showing {rowOffset + 1}–{Math.min(rowOffset + uploads.length, total)}
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
          <button
            onClick={onClose}
            disabled={isBusy}
            className="text-gray-400 hover:text-gray-500 disabled:opacity-50"
            aria-label="Close"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {canQuickUpload && (
          <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
              <ArrowUpTrayIcon className="h-5 w-5 text-blue-600" />
              Quick upload for block {blockCode}
            </div>
            <div className="mt-3 space-y-3">
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  setUploadFiles(files);
                  setRecentUploadedPages([]);
                  setBatchProgress(IDLE_BATCH_PROGRESS);
                }}
                disabled={isBusy}
                className="block w-full text-sm text-gray-700 file:mr-4 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100 disabled:opacity-50"
              />
              {uploadFiles.length > 0 && (
                <p className="text-sm text-gray-600">
                  {uploadFiles.length} file{uploadFiles.length === 1 ? '' : 's'} selected
                </p>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <select
                  value={uploadTag}
                  onChange={(event) => setUploadTag(event.target.value)}
                  disabled={isBusy}
                  className="rounded-md border border-gray-300 py-2 pl-3 pr-8 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                >
                  <option value="page">Page</option>
                  <option value="title">Title</option>
                </select>
                <select
                  value={uploadGender}
                  onChange={(event) =>
                    setUploadGender(event.target.value === 'female' ? 'female' : 'male')
                  }
                  disabled={isBusy}
                  className="rounded-md border border-gray-300 py-2 pl-3 pr-8 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
                <select
                  value={uploadReligion}
                  onChange={(event) =>
                    setUploadReligion(event.target.value === 'qadiani' ? 'qadiani' : 'muslim')
                  }
                  disabled={isBusy}
                  className="rounded-md border border-gray-300 py-2 pl-3 pr-8 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                >
                  <option value="muslim">Muslim</option>
                  <option value="qadiani">Qadiani</option>
                </select>
              </div>

              {batchProgress.phase !== 'idle' && (
                <div>
                  <div className="h-2.5 w-full rounded-full bg-gray-200">
                    <div
                      className="h-2.5 rounded-full bg-green-600 transition-all duration-300"
                      style={{
                        width: `${
                          batchProgress.total > 0
                            ? (batchProgress.current / batchProgress.total) * 100
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                  <p className="mt-2 text-center text-sm text-gray-600">
                    {batchProgress.phase === 'uploading' ? 'Uploading' : 'Processing'}{' '}
                    {batchProgress.current} of {batchProgress.total}
                  </p>
                  {batchProgress.currentFileName && (
                    <p
                      className="mt-1 truncate text-center text-xs text-gray-500"
                      title={batchProgress.currentFileName}
                    >
                      {batchProgress.currentFileName}
                    </p>
                  )}
                  {batchProgress.phase === 'processing' && (
                    <p className="mt-1 text-center text-xs text-gray-500">
                      {batchProgress.created} created · {batchProgress.enriched} enriched ·{' '}
                      {batchProgress.unchanged} unchanged · {batchProgress.ocrRun} OCR run ·{' '}
                      {batchProgress.processErrors} errors
                    </p>
                  )}
                  {batchProgress.lastError && (
                    <p className="mt-1 text-center text-xs text-red-600">{batchProgress.lastError}</p>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  onClick={() => void handleQuickUpload()}
                  disabled={isBusy || !uploadFiles.length}
                  className="inline-flex flex-1 items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {batchProgress.phase === 'uploading'
                    ? 'Uploading…'
                    : `Upload ${uploadFiles.length || ''} Page${uploadFiles.length === 1 ? '' : 's'}`.trim()}
                </button>
                <button
                  onClick={() => void handleProcessUploadedPages()}
                  disabled={!recentUploadedPages.length || isBusy}
                  className="inline-flex flex-1 items-center justify-center rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {batchProgress.phase === 'processing'
                    ? 'Processing…'
                    : `Process ${recentUploadedPages.length || ''} Uploaded Page${recentUploadedPages.length === 1 ? '' : 's'}`.trim()}
                </button>
                <button
                  onClick={() => void handleUploadAndProcessAll()}
                  disabled={isBusy || !uploadFiles.length}
                  className="inline-flex flex-1 items-center justify-center rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Upload & Process All
                </button>
              </div>

              {recentUploadedPages.length > 0 && batchProgress.phase === 'idle' && (
                <p className="text-sm text-green-700">
                  {recentUploadedPages.length} page{recentUploadedPages.length === 1 ? '' : 's'} ready
                  to process
                </p>
              )}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-auto px-6 py-4">
          {loadError ? (
            <div className="py-12 text-center">
              <p className="text-sm text-red-600">{loadError}</p>
              <button
                onClick={() => void fetchPage(currentPage, pageSize)}
                disabled={isBusy}
                className="mt-4 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Retry
              </button>
            </div>
          ) : isInitialLoad ? (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="sticky top-0 bg-gray-50">
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
                <UploadTableSkeletonRows count={PREVIEW_ROW_COUNT} />
              </tbody>
            </table>
          ) : !isStreaming && uploads.length === 0 ? (
            <div className="py-12 text-center text-gray-500">No uploaded images found</div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="sticky top-0 bg-gray-50">
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
                          onClick={() => onViewImage(upload, uploads, index, currentPage)}
                          className="rounded-md p-1.5 text-indigo-600 hover:bg-indigo-50"
                          title="View image"
                        >
                          <PhotoIcon className="h-5 w-5" />
                        </button>
                        <Link
                          href={`/dashboard/blockcodes/${upload._id}/ocr`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-md p-1.5 text-emerald-600 hover:bg-emerald-50"
                          title="View OCR reproduction"
                        >
                          <DocumentTextIcon className="h-5 w-5" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
                {previewSkeletonCount > 0 && <UploadTableSkeletonRows count={previewSkeletonCount} />}
                {trailingSkeletonCount > 0 && <UploadTableSkeletonRows count={trailingSkeletonCount} />}
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
                disabled={isStreaming || isBusy}
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage <= 1 || isStreaming || isBusy}
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
                disabled={currentPage >= totalPages || isStreaming || isBusy}
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
            disabled={isBusy}
            className="w-full rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
