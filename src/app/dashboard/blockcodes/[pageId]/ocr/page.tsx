'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeftIcon, ArrowPathIcon, ChevronLeftIcon, ChevronRightIcon, TableCellsIcon, UserPlusIcon } from '@heroicons/react/24/outline';
import OcrPageReproductionView from '@/components/ocr/OcrPageReproductionView';
import PageImageRotationControls from '@/components/ocr/PageImageRotationControls';
import TableColumnSettingsModal from '@/components/constituency/TableColumnSettingsModal';
import type { OcrDataPayload } from '@/lib/ocr-types';
import type { ConstituencyTableColumnSettings } from '@/lib/table-column-settings';
import { blockCodeHubPath } from '@/lib/blockcode-hub';
import type { BlockPageNavigation } from '@/lib/blockcode-page-navigation';
import { ocrPageHref, safeReturnTo } from '@/lib/ocr-navigation';

interface BlockcodePageMeta {
  _id: string;
  blockCode: string;
  fileName: string;
  url: string;
  halkaName: string;
  tag?: string;
  status: string;
  ocrAt?: string | null;
}

export default function BlockcodeOcrPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        </div>
      }
    >
      <BlockcodeOcrPageContent />
    </Suspense>
  );
}

function BlockcodeOcrPageContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pageId = params.pageId as string;
  const returnTo = safeReturnTo(searchParams.get('returnTo'));

  const [page, setPage] = useState<BlockcodePageMeta | null>(null);
  const [ocrData, setOcrData] = useState<OcrDataPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunningOcr, setIsRunningOcr] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [constituencyId, setConstituencyId] = useState<string | null>(null);
  const [columnSettings, setColumnSettings] = useState<ConstituencyTableColumnSettings | null>(null);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [previewRotation, setPreviewRotation] = useState(0);
  const [imageCacheKey, setImageCacheKey] = useState(0);
  const [navigation, setNavigation] = useState<BlockPageNavigation | null>(null);

  const loadColumnSettings = useCallback(async (halkaName: string) => {
    try {
      const response = await fetch(
        `/api/constituency/table-columns?halkaName=${encodeURIComponent(halkaName)}`
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load column settings');
      }
      setConstituencyId(data.constituencyId ?? null);
      setColumnSettings(data.tableColumnSettings ?? null);
    } catch {
      setColumnSettings(null);
    }
  }, []);

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
      setNavigation(data.navigation ?? null);
      if (data.page?.halkaName) {
        await loadColumnSettings(data.page.halkaName);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load page';
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [pageId, loadColumnSettings]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  const enrichPageVoters = async () => {
    if (!ocrData) {
      toast.error('Run OCR first — no voter data on this page.');
      return;
    }
    setIsEnriching(true);
    try {
      const response = await fetch(`/api/blockcodes/${pageId}/enrich`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.details || data.error || 'Enrich failed');
      }
      const { enrich } = data;
      toast.success(
        `Enriched page — ${enrich.created} created, ${enrich.enriched} enriched, ${enrich.unchanged} unchanged`
      );
      if (data.createdCnics?.length) {
        for (const cnic of data.createdCnics as string[]) {
          toast.success(`+created ${cnic}`, { duration: 4000 });
        }
      }
      await loadPage();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Enrich failed');
    } finally {
      setIsEnriching(false);
    }
  };

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

  const goBack = useCallback(() => {
    if (returnTo) {
      router.push(returnTo);
      return;
    }
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }
    if (page) {
      router.push(blockCodeHubPath(page.blockCode, page.halkaName, 'pages'));
      return;
    }
    router.push('/dashboard/constituency/');
  }, [returnTo, router, page]);

  const goToNeighborPage = useCallback(
    (neighborId: string) => {
      setPreviewRotation(0);
      router.push(ocrPageHref(neighborId, returnTo ?? undefined));
    },
    [router, returnTo]
  );

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
        <button
          type="button"
          onClick={goBack}
          className="mt-4 inline-flex items-center text-indigo-600 hover:underline"
        >
          <ArrowLeftIcon className="mr-1 h-4 w-4" />
          Back
        </button>
      </div>
    );
  }

  const imageUrl = `${ocrData?.imageUrl || page.url}${(ocrData?.imageUrl || page.url).includes('?') ? '&' : '?'}v=${imageCacheKey}`;

  const handleRotationSaved = async ({ ocrCleared }: { url: string; ocrCleared: boolean }) => {
    setPreviewRotation(0);
    setImageCacheKey((value) => value + 1);
    if (ocrCleared) {
      setOcrData(null);
    }
    await loadPage();
    if (ocrCleared) {
      toast('OCR data cleared — re-run OCR after rotating.', { icon: 'ℹ️' });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={goBack}
            className="mb-2 inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeftIcon className="mr-1 h-4 w-4" />
            Back
          </button>
          <h1 className="text-2xl font-bold text-gray-900">OCR page view</h1>
          <p className="mt-1 text-sm text-gray-600">
            {page.blockCode} · {page.fileName} · {page.halkaName}
            {page.tag === 'title' ? ' · title page' : ''}
          </p>
          {page.ocrAt && (
            <p className="text-xs text-gray-400">
              OCR at {new Date(page.ocrAt).toLocaleString()}
            </p>
          )}
          {navigation && navigation.totalPages > 0 && (
            <p className="mt-1 text-xs text-gray-500">
              Page {navigation.pageIndex} of {navigation.totalPages} in block {page.blockCode}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigation?.previous && goToNeighborPage(navigation.previous._id)}
            disabled={!navigation?.previous || isRunningOcr || isEnriching || previewRotation !== 0}
            title={navigation?.previous?.fileName ?? 'No previous page'}
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ChevronLeftIcon className="mr-1 h-4 w-4" />
            Previous
          </button>
          <button
            type="button"
            onClick={() => navigation?.next && goToNeighborPage(navigation.next._id)}
            disabled={!navigation?.next || isRunningOcr || isEnriching || previewRotation !== 0}
            title={navigation?.next?.fileName ?? 'No next page'}
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
            <ChevronRightIcon className="ml-1 h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setShowColumnSettings(true)}
            disabled={!constituencyId}
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <TableCellsIcon className="mr-2 h-4 w-4" />
            Column settings
          </button>
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
            onClick={enrichPageVoters}
            disabled={isEnriching || !ocrData}
            className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <UserPlusIcon className={`mr-2 h-4 w-4 ${isEnriching ? 'animate-pulse' : ''}`} />
            {isEnriching ? 'Enriching…' : 'Enrich voters'}
          </button>
          <button
            type="button"
            onClick={runOcr}
            disabled={isRunningOcr || previewRotation !== 0}
            className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            <ArrowPathIcon className={`mr-2 h-4 w-4 ${isRunningOcr ? 'animate-spin' : ''}`} />
            {ocrData ? 'Re-run OCR' : 'Run OCR'}
          </button>
        </div>
      </div>

      <PageImageRotationControls
        pageId={pageId}
        previewRotation={previewRotation}
        onPreviewRotationChange={setPreviewRotation}
        onSaved={handleRotationSaved}
        disabled={isRunningOcr || isEnriching}
      />

      {!ocrData ? (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="flex min-h-[50vh] items-center justify-center bg-gray-100 p-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt="Scanned page"
              className="max-h-[70vh] max-w-full object-contain shadow-lg"
              style={
                previewRotation
                  ? {
                      transform: `rotate(${previewRotation}deg)`,
                      transformOrigin: 'center center',
                    }
                  : undefined
              }
            />
          </div>
          <div className="border-t border-amber-200 bg-amber-50 p-6 text-center">
            <p className="text-amber-900">No OCR data stored for this page yet.</p>
            <p className="mt-2 text-sm text-amber-800">
              Rotate the scan if needed, save the image, then run OCR.
            </p>
            <button
              type="button"
              onClick={runOcr}
              disabled={isRunningOcr || previewRotation !== 0}
              className="mt-4 inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <ArrowPathIcon className={`mr-2 h-4 w-4 ${isRunningOcr ? 'animate-spin' : ''}`} />
              Run OCR now
            </button>
            {previewRotation !== 0 && (
              <p className="mt-2 text-xs text-amber-700">Save rotation before running OCR.</p>
            )}
          </div>
        </div>
      ) : (
        <OcrPageReproductionView
          imageUrl={imageUrl}
          ocrData={ocrData}
          pageId={pageId}
          halkaName={page.halkaName}
          blockCode={page.blockCode}
          constituencyId={constituencyId ?? undefined}
          columnSettings={columnSettings}
          onColumnSettingsChange={setColumnSettings}
          onOpenColumnSettings={() => setShowColumnSettings(true)}
          onEnrichPage={enrichPageVoters}
          isEnrichingPage={isEnriching}
          previewRotation={previewRotation}
        />
      )}

      {constituencyId && (
        <TableColumnSettingsModal
          isOpen={showColumnSettings}
          onClose={() => setShowColumnSettings(false)}
          constituencyId={constituencyId}
          halkaName={page.halkaName}
          blockCode={page.blockCode}
          pageId={pageId}
          imageUrl={imageUrl}
          initialSettings={columnSettings}
          onSaved={(settings) => {
            setColumnSettings(settings);
            setOcrData((current) =>
              current
                ? {
                    ...current,
                    voterTableRows: undefined,
                    voterTableMeta: undefined,
                  }
                : current
            );
          }}
        />
      )}
    </div>
  );
}
