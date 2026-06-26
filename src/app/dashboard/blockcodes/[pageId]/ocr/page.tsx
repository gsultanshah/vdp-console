'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeftIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import OcrPageReproductionView from '@/components/ocr/OcrPageReproductionView';
import type { OcrDataPayload } from '@/lib/ocr-types';

interface BlockcodePageMeta {
  _id: string;
  blockCode: string;
  fileName: string;
  url: string;
  halkaName: string;
  status: string;
  ocrAt?: string | null;
}

export default function BlockcodeOcrPage() {
  const params = useParams();
  const pageId = params.pageId as string;

  const [page, setPage] = useState<BlockcodePageMeta | null>(null);
  const [ocrData, setOcrData] = useState<OcrDataPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunningOcr, setIsRunningOcr] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/blockcodes/${pageId}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load page');
      }
      setPage(data.page);
      setOcrData(data.ocr_data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load page';
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [pageId]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  const runOcr = async () => {
    setIsRunningOcr(true);
    try {
      const response = await fetch(
        `/api/blockcodes/process-document?page_id=${encodeURIComponent(pageId)}&mode=ocr_only`
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.details || data.error || 'OCR failed');
      }
      setOcrData(data.ocr_data);
      toast.success('OCR completed');
      await loadPage();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'OCR failed');
    } finally {
      setIsRunningOcr(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-red-700">{error ?? 'Page not found'}</p>
        <Link href="/dashboard/constituency" className="mt-4 inline-block text-indigo-600 hover:underline">
          Back to constituency
        </Link>
      </div>
    );
  }

  const imageUrl = ocrData?.imageUrl || page.url;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/dashboard/constituency"
            className="mb-2 inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeftIcon className="mr-1 h-4 w-4" />
            Constituency
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">OCR page view</h1>
          <p className="mt-1 text-sm text-gray-600">
            {page.blockCode} · {page.fileName} · {page.halkaName}
          </p>
          {page.ocrAt && (
            <p className="text-xs text-gray-400">
              OCR at {new Date(page.ocrAt).toLocaleString()}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={page.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Open scan
          </a>
          <button
            type="button"
            onClick={runOcr}
            disabled={isRunningOcr}
            className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            <ArrowPathIcon className={`mr-2 h-4 w-4 ${isRunningOcr ? 'animate-spin' : ''}`} />
            {ocrData ? 'Re-run OCR' : 'Run OCR'}
          </button>
        </div>
      </div>

      {!ocrData ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-8 text-center">
          <p className="text-amber-900">No OCR data stored for this page yet.</p>
          <p className="mt-2 text-sm text-amber-800">
            Run OCR to generate a reproduction from Google Vision annotations.
          </p>
          <button
            type="button"
            onClick={runOcr}
            disabled={isRunningOcr}
            className="mt-4 inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            <ArrowPathIcon className={`mr-2 h-4 w-4 ${isRunningOcr ? 'animate-spin' : ''}`} />
            Run OCR now
          </button>
        </div>
      ) : (
        <OcrPageReproductionView imageUrl={imageUrl} ocrData={ocrData} />
      )}
    </div>
  );
}
