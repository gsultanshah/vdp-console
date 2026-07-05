'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Cog6ToothIcon, PlayIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { Progress } from '@/components/ui/progress';
import { fetchJson } from '@/lib/fetch-json';
import type { BlockCodeContext } from '@/lib/blockcode-hub';
import { blockCodeHubPath } from '@/lib/blockcode-hub';
import { ocrPageHref } from '@/lib/ocr-navigation';

interface BlockCodePage {
  _id: string;
  blockCode: string;
  fileName: string;
  halkaName: string;
  status: string;
  tag?: string;
  uploadedAt: string;
}

interface ProcessProgress {
  current: number;
  total: number;
  currentFileName: string;
  created: number;
  enriched: number;
  unchanged: number;
  errors: number;
  ocrRun: number;
  lastError: string;
}

interface BlockCodeProcessTabProps {
  context: BlockCodeContext;
  onProcessed?: () => void;
}

const IDLE_PROGRESS: ProcessProgress = {
  current: 0,
  total: 0,
  currentFileName: '',
  created: 0,
  enriched: 0,
  unchanged: 0,
  errors: 0,
  ocrRun: 0,
  lastError: '',
};

export default function BlockCodeProcessTab({ context, onProcessed }: BlockCodeProcessTabProps) {
  const { blockCode } = context;
  const [pages, setPages] = useState<BlockCodePage[]>([]);
  const [isLoadingPages, setIsLoadingPages] = useState(true);
  const [selectedPageId, setSelectedPageId] = useState('');
  const [forceOcr, setForceOcr] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<ProcessProgress>(IDLE_PROGRESS);

  const loadPages = useCallback(async () => {
    setIsLoadingPages(true);
    try {
      const { response, data } = await fetchJson<BlockCodePage[] | { error?: string }>(
        `/api/blockcodes/?blockCode=${encodeURIComponent(blockCode)}&lite=true`
      );
      if (!response.ok) throw new Error('error' in data ? data.error : 'Failed to load pages');
      const list = Array.isArray(data) ? data.filter((p) => p.tag !== 'title') : [];
      setPages(list);
      if (list.length && !selectedPageId) {
        setSelectedPageId(list[0]._id);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load pages');
      setPages([]);
    } finally {
      setIsLoadingPages(false);
    }
  }, [blockCode]);

  useEffect(() => {
    void loadPages();
  }, [loadPages]);

  const processPages = async (targetPages: BlockCodePage[]) => {
    if (!targetPages.length) {
      toast.error('No pages to process');
      return;
    }

    setIsProcessing(true);
    let created = 0;
    let enriched = 0;
    let unchanged = 0;
    let errors = 0;
    let ocrRun = 0;
    let lastError = '';

    setProgress({
      ...IDLE_PROGRESS,
      total: targetPages.length,
      currentFileName: targetPages[0].fileName,
    });

    for (let i = 0; i < targetPages.length; i += 1) {
      const page = targetPages[i];
      setProgress((prev) => ({
        ...prev,
        current: i,
        currentFileName: page.fileName,
        lastError: '',
      }));

      try {
        const { response, data } = await fetchJson<{
          details?: string;
          error?: string;
          enrich?: { created?: number; enriched?: number; unchanged?: number; errors?: number };
          ocr_skipped?: boolean;
        }>(
          `/api/blockcodes/process-enrich/?page_id=${encodeURIComponent(page._id)}${forceOcr ? '&force=true' : ''}`
        );

        if (!response.ok) throw new Error(data.details || data.error || 'Processing failed');
        created += data.enrich?.created ?? 0;
        enriched += data.enrich?.enriched ?? 0;
        unchanged += data.enrich?.unchanged ?? 0;
        errors += data.enrich?.errors ?? 0;
        if (!data.ocr_skipped) ocrRun += 1;
      } catch (error) {
        errors += 1;
        lastError = error instanceof Error ? error.message : 'Processing failed';
      }

      setProgress({
        current: i + 1,
        total: targetPages.length,
        currentFileName: page.fileName,
        created,
        enriched,
        unchanged,
        errors,
        ocrRun,
        lastError,
      });
    }

    setIsProcessing(false);
    onProcessed?.();
    toast.success(
      `Done — ${created} created, ${enriched} enriched, ${unchanged} unchanged, ${ocrRun} OCR run, ${errors} errors`
    );
  };

  const processOne = () => {
    const page = pages.find((p) => p._id === selectedPageId);
    if (!page) {
      toast.error('Select a page');
      return;
    }
    void processPages([page]);
  };

  const processAll = () => void processPages(pages);

  const progressPercent =
    progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Process pages</h2>
        <p className="text-sm text-gray-500">
          Run OCR and voter enrichment on a single page or the entire block ({pages.length.toLocaleString()} pages).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Cog6ToothIcon className="h-5 w-5 text-indigo-600" />
            Process single page
          </h3>
          <div className="mt-4 space-y-3">
            <select
              value={selectedPageId}
              onChange={(e) => setSelectedPageId(e.target.value)}
              disabled={isProcessing || isLoadingPages || !pages.length}
              className="w-full rounded-md border border-gray-300 py-2 pl-3 pr-8 text-sm disabled:opacity-50"
            >
              {isLoadingPages ? (
                <option>Loading pages…</option>
              ) : pages.length === 0 ? (
                <option>No pages available</option>
              ) : (
                pages.map((page) => (
                  <option key={page._id} value={page._id}>
                    {page.fileName} ({page.status})
                  </option>
                ))
              )}
            </select>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={forceOcr}
                onChange={(e) => setForceOcr(e.target.checked)}
                disabled={isProcessing}
                className="rounded border-gray-300 text-indigo-600"
              />
              Force OCR re-run
            </label>
            <button
              onClick={processOne}
              disabled={isProcessing || !selectedPageId}
              className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Process selected page
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <PlayIcon className="h-5 w-5 text-green-600" />
            Process entire block
          </h3>
          <p className="mt-2 text-sm text-gray-600">
            Sequentially process all {pages.length.toLocaleString()} non-title pages in block {blockCode}.
          </p>
          <button
            onClick={processAll}
            disabled={isProcessing || !pages.length}
            className="mt-4 w-full rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            Process all pages
          </button>
        </div>
      </div>

      {isProcessing && (
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-gray-900">
              Processing {progress.current} of {progress.total}
            </span>
            <span className="text-gray-500">{progressPercent}%</span>
          </div>
          <Progress value={progressPercent} className="mt-3 h-2" />
          {progress.currentFileName && (
            <p className="mt-2 truncate text-xs text-gray-500">{progress.currentFileName}</p>
          )}
          <p className="mt-2 text-xs text-gray-600">
            {progress.created} created · {progress.enriched} enriched · {progress.unchanged} unchanged ·{' '}
            {progress.ocrRun} OCR · {progress.errors} errors
          </p>
          {progress.lastError && <p className="mt-1 text-xs text-red-600">{progress.lastError}</p>}
        </div>
      )}

      {!isLoadingPages && pages.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-4 py-3">
            <p className="text-sm font-medium text-gray-900">Page queue ({pages.length})</p>
          </div>
          <div className="max-h-64 overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs uppercase text-gray-500">File</th>
                  <th className="px-4 py-2 text-left text-xs uppercase text-gray-500">Status</th>
                  <th className="px-4 py-2 text-left text-xs uppercase text-gray-500">OCR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pages.slice(0, 100).map((page) => (
                  <tr key={page._id} className="hover:bg-gray-50">
                    <td className="px-4 py-2">{page.fileName}</td>
                    <td className="px-4 py-2 capitalize text-gray-600">{page.status}</td>
                    <td className="px-4 py-2">
                      <Link
                        href={ocrPageHref(
                          page._id,
                          blockCodeHubPath(context.blockCode, context.halkaName, 'process')
                        )}
                        className="text-indigo-600 hover:text-indigo-800"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pages.length > 100 && (
              <p className="px-4 py-2 text-xs text-gray-500">Showing first 100 of {pages.length} pages</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
