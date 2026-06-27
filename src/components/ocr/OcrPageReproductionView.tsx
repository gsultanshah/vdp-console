'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  MagnifyingGlassIcon,
  UserPlusIcon,
} from '@heroicons/react/24/outline';
import { buildCloudinaryRowCropUrl, resolveCloudinaryPublicId } from '@/lib/cloudinary-url';
import { getVoterTableFromOcrData } from '@/lib/ocr-processing';
import type {
  OcrDataPayload,
  OcrProcessedRow,
  OcrVoterRow,
  OcrVoterTableRow,
} from '@/lib/ocr-types';

interface VisionAnnotation {
  description?: string | null;
  boundingPoly?: {
    vertices?: { x?: number; y?: number }[];
  };
}

interface OcrPageReproductionViewProps {
  imageUrl: string;
  ocrData: OcrDataPayload;
  pageId: string;
  halkaName: string;
  onEnrichPage?: () => Promise<void>;
  isEnrichingPage?: boolean;
}

function getPageDimensions(ocrData: OcrDataPayload, imageNatural?: { width: number; height: number }) {
  const vision = ocrData.vision as {
    fullTextAnnotation?: { pages?: { width?: number; height?: number }[] };
  };
  const page = vision.fullTextAnnotation?.pages?.[0];
  return {
    width: page?.width ?? imageNatural?.width ?? 2480,
    height: page?.height ?? imageNatural?.height ?? 3505,
  };
}

function bboxFromVertices(vertices: { x?: number; y?: number }[]) {
  const xs = vertices.map((v) => v.x ?? 0);
  const ys = vertices.map((v) => v.y ?? 0);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

export default function OcrPageReproductionView({
  imageUrl,
  ocrData,
  pageId,
  halkaName,
  onEnrichPage,
  isEnrichingPage,
}: OcrPageReproductionViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [scale, setScale] = useState(1);
  const [showBoxes, setShowBoxes] = useState(false);
  const [showImage, setShowImage] = useState(true);
  const [viewMode, setViewMode] = useState<'overlay' | 'rows' | 'voter-rows'>('voter-rows');

  const pageSize = useMemo(
    () => getPageDimensions(ocrData, imageSize ?? undefined),
    [ocrData, imageSize]
  );

  const annotations = useMemo(() => {
    const vision = ocrData.vision as { textAnnotations?: VisionAnnotation[] };
    const list = vision.textAnnotations ?? [];
    return list.length > 1 ? list.slice(1) : list;
  }, [ocrData]);

  const fitToContainer = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const padding = 32;
    const availableWidth = container.clientWidth - padding;
    const availableHeight = container.clientHeight - padding;
    const scaleX = availableWidth / pageSize.width;
    const scaleY = availableHeight / pageSize.height;
    setScale(Math.min(scaleX, scaleY, 1));
  }, [pageSize.width, pageSize.height]);

  useEffect(() => {
    fitToContainer();
    window.addEventListener('resize', fitToContainer);
    return () => window.removeEventListener('resize', fitToContainer);
  }, [fitToContainer, pageSize]);

  const { rows: voterTableRows, meta: voterTableMeta } = useMemo(
    () => getVoterTableFromOcrData(ocrData),
    [ocrData]
  );

  const rowColors = useMemo(() => {
    const count = Math.max(voterTableRows.length, ocrData.processedRows?.length ?? 0);
    return Array.from({ length: count }, (_, i) => `hsla(${(i * 47) % 360}, 70%, 82%, 0.35)`);
  }, [voterTableRows.length, ocrData.processedRows]);

  return (
    <div className="flex h-full min-h-[70vh] flex-col gap-4 lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setViewMode('overlay')}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                viewMode === 'overlay'
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Text overlay
            </button>
            <button
              type="button"
              onClick={() => setViewMode('voter-rows')}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                viewMode === 'voter-rows'
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Voter rows
            </button>
            <button
              type="button"
              onClick={() => setViewMode('rows')}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                viewMode === 'rows'
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Row bands
            </button>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={showImage}
                onChange={(e) => setShowImage(e.target.checked)}
                className="rounded border-gray-300"
              />
              Show image
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={showBoxes}
                onChange={(e) => setShowBoxes(e.target.checked)}
                className="rounded border-gray-300"
              />
              Show boxes
            </label>
            <button
              type="button"
              onClick={() => setScale((s) => Math.min(s + 0.1, 2))}
              className="rounded-md border border-gray-300 px-2 py-1 text-sm hover:bg-gray-50"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => setScale((s) => Math.max(s - 0.1, 0.2))}
              className="rounded-md border border-gray-300 px-2 py-1 text-sm hover:bg-gray-50"
            >
              −
            </button>
            <button
              type="button"
              onClick={fitToContainer}
              className="rounded-md border border-gray-300 px-2 py-1 text-sm hover:bg-gray-50"
            >
              Fit
            </button>
            <span className="text-xs text-gray-500">{Math.round(scale * 100)}%</span>
          </div>
        </div>

        <div
          ref={containerRef}
          className="relative flex-1 overflow-auto bg-gray-100 p-4"
          style={{ minHeight: '60vh' }}
        >
          <div
            className="relative mx-auto origin-top-left shadow-lg"
            style={{
              width: pageSize.width,
              height: pageSize.height,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              backgroundColor: showImage ? undefined : '#fff',
            }}
          >
            {showImage && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={imageUrl}
                alt="Scanned page"
                className="absolute inset-0 h-full w-full object-fill"
                crossOrigin="anonymous"
                onLoad={(e) => {
                  const img = e.currentTarget;
                  setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
                }}
              />
            )}

            {viewMode === 'voter-rows' && (
              <VoterRowBandsOverlay rows={voterTableRows} colors={rowColors} />
            )}

            {viewMode === 'rows' && (
              <RowBandsOverlay rows={ocrData.processedRows ?? []} colors={rowColors} pageWidth={pageSize.width} />
            )}

            {viewMode === 'overlay' &&
              annotations.map((annotation, index) => {
                const vertices = annotation.boundingPoly?.vertices;
                if (!vertices?.length) return null;
                const { minX, minY, width, height } = bboxFromVertices(vertices);
                const text = (annotation.description ?? '').trim();
                if (!text) return null;

                const fontSize = Math.max(8, Math.min(height * 0.85, 28));

                return (
                  <span
                    key={`${minX}-${minY}-${index}`}
                    className="absolute overflow-hidden leading-none text-gray-900"
                    style={{
                      left: minX,
                      top: minY,
                      width: Math.max(width, 4),
                      height: Math.max(height, 4),
                      fontSize,
                      direction: 'rtl',
                      unicodeBidi: 'plaintext',
                      fontFamily: "'Noto Nastaliq Urdu', 'Arial Unicode MS', Arial, sans-serif",
                      border: showBoxes ? '1px solid rgba(239, 68, 68, 0.7)' : undefined,
                      backgroundColor: showBoxes ? 'rgba(255, 255, 255, 0.15)' : undefined,
                    }}
                    title={text}
                  >
                    {text}
                  </span>
                );
              })}

            {viewMode === 'voter-rows' &&
              voterTableRows.flatMap((row) =>
                row.elements.map((element, elIndex) => (
                  <span
                    key={`voter-row-${row.rowIndex}-el-${elIndex}`}
                    className="absolute overflow-hidden leading-none text-gray-900"
                    style={{
                      left: element.x,
                      top: element.vertices.length
                        ? Math.min(...element.vertices.map((v) => v.y ?? 0))
                        : row.band.y,
                      width: Math.max(element.width, 4),
                      height: Math.max(element.height, 4),
                      fontSize: Math.max(8, Math.min(element.height * 0.85, 28)),
                      direction: 'rtl',
                      unicodeBidi: 'plaintext',
                      fontFamily: "'Noto Nastaliq Urdu', 'Arial Unicode MS', Arial, sans-serif",
                      border: showBoxes ? '1px solid rgba(34, 197, 94, 0.8)' : undefined,
                    }}
                  >
                    {element.text}
                  </span>
                ))
              )}

            {viewMode === 'rows' &&
              (ocrData.processedRows ?? []).flatMap((row, rowIndex) =>
                row.elements.map((element, elIndex) => (
                  <span
                    key={`row-${rowIndex}-el-${elIndex}`}
                    className="absolute overflow-hidden leading-none text-gray-900"
                    style={{
                      left: element.x,
                      top: row.y,
                      width: Math.max(element.width, 4),
                      height: Math.max(element.height, 4),
                      fontSize: Math.max(8, Math.min(element.height * 0.85, 28)),
                      direction: 'rtl',
                      unicodeBidi: 'plaintext',
                      fontFamily: "'Noto Nastaliq Urdu', 'Arial Unicode MS', Arial, sans-serif",
                      border: showBoxes ? '1px solid rgba(59, 130, 246, 0.7)' : undefined,
                    }}
                  >
                    {element.text}
                  </span>
                ))
              )}
          </div>
        </div>

        <div className="border-t border-gray-200 px-4 py-2 text-xs text-gray-500">
          Page {pageSize.width}×{pageSize.height}px · {annotations.length} OCR tokens ·{' '}
          {voterTableRows.length} voter rows
          {voterTableMeta
            ? ` · row h≈${voterTableMeta.medianRowHeight}px · first CNIC y=${voterTableMeta.firstCnicY}`
            : ''}{' '}
          · skew {ocrData.skewAngle?.toFixed(4) ?? '0'} rad
        </div>
      </div>

      <VoterDataPanel
        pageId={pageId}
        halkaName={halkaName}
        imageUrl={imageUrl}
        voters={ocrData.finalJson ?? []}
        voterTableRows={voterTableRows}
        voterTableMeta={voterTableMeta}
        processedRows={ocrData.processedRows ?? []}
        onEnrichPage={onEnrichPage}
        isEnrichingPage={isEnrichingPage}
      />
    </div>
  );
}

function VoterRowBandsOverlay({
  rows,
  colors,
}: {
  rows: OcrVoterTableRow[];
  colors: string[];
}) {
  if (!rows.length) return null;

  return (
    <>
      {rows.map((row, index) => (
        <div
          key={`voter-band-${row.cnic}-${index}`}
          className="pointer-events-none absolute left-0 border-y border-emerald-600/50"
          style={{
            top: row.band.y,
            width: row.band.width,
            height: row.band.height,
            backgroundColor: colors[index % colors.length],
          }}
          title={`y=${row.band.y} h=${row.band.height}`}
        />
      ))}
    </>
  );
}

function RowBandsOverlay({
  rows,
  colors,
  pageWidth,
}: {
  rows: OcrProcessedRow[];
  colors: string[];
  pageWidth: number;
}) {
  if (!rows.length) return null;

  return (
    <>
      {rows.map((row, index) => {
        const maxHeight = row.elements.reduce((max, el) => Math.max(max, el.height), 0);
        const nextY = rows[index + 1]?.y;
        const bandHeight = nextY ? nextY - row.y : maxHeight * 2.5;

        return (
          <div
            key={`band-${row.y}-${index}`}
            className="pointer-events-none absolute left-0"
            style={{
              top: row.y,
              width: pageWidth,
              height: bandHeight,
              backgroundColor: colors[index % colors.length],
            }}
          />
        );
      })}
    </>
  );
}

function VoterDataPanel({
  pageId,
  halkaName,
  imageUrl,
  voters,
  voterTableRows,
  voterTableMeta,
  processedRows,
  onEnrichPage,
  isEnrichingPage,
}: {
  pageId: string;
  halkaName: string;
  imageUrl: string;
  voters: OcrVoterRow[];
  voterTableRows: OcrVoterTableRow[];
  voterTableMeta?: {
    medianRowHeight: number;
    firstCnicY: number;
  };
  processedRows: OcrProcessedRow[];
  onEnrichPage?: () => Promise<void>;
  isEnrichingPage?: boolean;
}) {
  const [cloudinaryPublicId, setCloudinaryPublicId] = useState<string | null>(null);
  const [isResolvingCloudinary, setIsResolvingCloudinary] = useState(true);
  const [cloudinaryError, setCloudinaryError] = useState<string | null>(null);
  const [foundCnics, setFoundCnics] = useState<Set<string>>(new Set());
  const [lookupPending, setLookupPending] = useState<Set<string>>(new Set());
  const [upsertingCnics, setUpsertingCnics] = useState<Set<string>>(new Set());
  const [isLookupLoading, setIsLookupLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      setIsResolvingCloudinary(true);
      setCloudinaryError(null);
      try {
        const publicId = await resolveCloudinaryPublicId(imageUrl);
        if (!cancelled) {
          setCloudinaryPublicId(publicId);
        }
      } catch (error) {
        if (!cancelled) {
          setCloudinaryPublicId(null);
          setCloudinaryError(error instanceof Error ? error.message : 'Cloudinary upload failed');
        }
      } finally {
        if (!cancelled) {
          setIsResolvingCloudinary(false);
        }
      }
    }

    resolve();
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  const lookupCnics = useCallback(
    async (cnics: string[]) => {
      const unique = Array.from(new Set(cnics.filter(Boolean)));
      if (unique.length === 0) return new Set<string>();

      setIsLookupLoading(true);
      setLookupPending(new Set(unique));
      try {
        const params = new URLSearchParams({
          cnics: unique.join(','),
          halkaName,
        });
        const response = await fetch(`/api/voters/lookup?${params.toString()}`);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Lookup failed');
        }
        const found = new Set<string>(data.found ?? []);
        setFoundCnics((prev) => {
          const next = new Set(prev);
          found.forEach((cnic) => next.add(cnic));
          return next;
        });
        return found;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Voter lookup failed');
        return new Set<string>();
      } finally {
        setLookupPending(new Set());
        setIsLookupLoading(false);
      }
    },
    [halkaName]
  );

  useEffect(() => {
    void lookupCnics(voterTableRows.map((row) => row.cnic));
  }, [voterTableRows, lookupCnics]);

  const upsertVoter = async (cnic: string, quiet = false) => {
    setUpsertingCnics((prev) => new Set(prev).add(cnic));
    try {
      const response = await fetch(`/api/blockcodes/${pageId}/voter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cnic }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.details || data.error || 'Upsert failed');
      }
      setFoundCnics((prev) => new Set(prev).add(cnic));
      if (!quiet) {
        const label =
          data.action === 'created'
            ? 'created'
            : data.action === 'enriched'
              ? 'enriched'
              : 'unchanged';
        toast.success(`${cnic} ${label} in ${halkaName}`);
      }
      return data.action as 'created' | 'enriched' | 'unchanged';
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to upsert voter');
      return null;
    } finally {
      setUpsertingCnics((prev) => {
        const next = new Set(prev);
        next.delete(cnic);
        return next;
      });
    }
  };

  const searchOrCreateVoter = async (cnic: string) => {
    setLookupPending((prev) => new Set(prev).add(cnic));
    try {
      const found = await lookupCnics([cnic]);
      if (found.has(cnic)) {
        return;
      }
      const action = await upsertVoter(cnic, true);
      if (action === 'created') {
        toast.success(`Created ${cnic} in ${halkaName}`);
      } else if (action === 'enriched') {
        toast.success(`Updated ${cnic} in ${halkaName}`);
      }
    } finally {
      setLookupPending((prev) => {
        const next = new Set(prev);
        next.delete(cnic);
        return next;
      });
    }
  };

  const getRowCropUrl = useCallback(
    (row: OcrVoterTableRow) =>
      cloudinaryPublicId
        ? buildCloudinaryRowCropUrl(cloudinaryPublicId, row.band.y, row.band.height)
        : null,
    [cloudinaryPublicId]
  );

  return (
    <div className="w-full shrink-0 rounded-lg border border-gray-200 bg-white shadow-sm lg:w-[28rem]">
      <div className="border-b border-gray-200 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Voter table (CNIC-anchored)</h3>
            <p className="text-xs text-gray-500">
              {voterTableRows.length} rows · {halkaName}
              {isLookupLoading ? ' · checking voters…' : ''}
              {isResolvingCloudinary ? ' · preparing Cloudinary…' : ''}
              {cloudinaryError ? ` · ${cloudinaryError}` : ''}
            </p>
          </div>
          {onEnrichPage && voterTableRows.length > 0 && (
            <button
              type="button"
              onClick={() => void onEnrichPage()}
              disabled={isEnrichingPage}
              className="inline-flex shrink-0 items-center rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <ArrowPathIcon
                className={`mr-1.5 h-3.5 w-3.5 ${isEnrichingPage ? 'animate-spin' : ''}`}
              />
              Enrich all
            </button>
          )}
        </div>
      </div>
      <div className="max-h-[40vh] overflow-auto border-b border-gray-200">
        {voterTableRows.length === 0 ? (
          <p className="p-4 text-sm text-gray-500">No CNIC-anchored voter rows on this page.</p>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="sticky top-0 bg-gray-50">
              <tr>
                <th className="px-2 py-2 text-left text-xs font-medium uppercase text-gray-500">#</th>
                <th className="px-2 py-2 text-left text-xs font-medium uppercase text-gray-500">CNIC</th>
                <th className="px-2 py-2 text-left text-xs font-medium uppercase text-gray-500">Crop</th>
                <th className="px-2 py-2 text-left text-xs font-medium uppercase text-gray-500">Scan</th>
                <th className="px-2 py-2 text-left text-xs font-medium uppercase text-gray-500">Voter</th>
                <th className="px-2 py-2 text-left text-xs font-medium uppercase text-gray-500">Save</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {voterTableRows.map((row) => {
                const cropUrl = getRowCropUrl(row);
                const isFound = foundCnics.has(row.cnic);
                const isPending = lookupPending.has(row.cnic);
                const isUpserting = upsertingCnics.has(row.cnic);
                const isBusy = isPending || isUpserting;
                const searchUrl = `/dashboard/search-voters?cnic=${encodeURIComponent(row.cnic)}`;

                return (
                <tr key={row.cnic} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-2 py-2 text-gray-500">{row.silsila_no || row.rowIndex}</td>
                  <td className="whitespace-nowrap px-2 py-2 font-mono text-xs text-gray-700">{row.cnic}</td>
                  <td className="px-2 py-2 font-mono text-[10px] text-gray-500">
                    y={row.band.y} h={row.band.height}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2">
                    {cropUrl ? (
                      <a
                        href={cropUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex rounded-md p-1.5 text-indigo-600 hover:bg-indigo-50"
                        title="Open row crop"
                      >
                        <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                        <span className="sr-only">Open voter row crop</span>
                      </a>
                    ) : (
                      <span
                        className="inline-flex rounded-md p-1.5 text-gray-300"
                        title={isResolvingCloudinary ? 'Uploading page to Cloudinary…' : cloudinaryError ?? 'Unavailable'}
                      >
                        <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2">
                    {isFound ? (
                      <a
                        href={searchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-md p-1.5 text-emerald-700 hover:bg-emerald-50"
                        title="Open voter in Search Voters"
                      >
                        <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                        <span className="sr-only">Open voter</span>
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void searchOrCreateVoter(row.cnic)}
                        disabled={isBusy}
                        className="inline-flex rounded-md p-1.5 text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                        title={isBusy ? 'Working…' : 'Find in voters or create from OCR'}
                      >
                        <MagnifyingGlassIcon className={`h-4 w-4 ${isBusy ? 'animate-pulse' : ''}`} />
                        <span className="sr-only">Find or create voter</span>
                      </button>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2">
                    <button
                      type="button"
                      onClick={() => void upsertVoter(row.cnic)}
                      disabled={isBusy}
                      className="inline-flex rounded-md p-1.5 text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
                      title="Upsert enriched voter from OCR row"
                    >
                      <UserPlusIcon className={`h-4 w-4 ${isBusy ? 'animate-pulse' : ''}`} />
                      <span className="sr-only">Upsert voter</span>
                    </button>
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        )}
      </div>
      <div className="border-b border-gray-200 px-4 py-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Page cut params</h4>
        {voterTableRows.length > 0 ? (
          <ul className="mt-2 space-y-1 text-[10px] font-mono text-gray-600">
            {voterTableRows.map((row) => {
              const cropUrl = getRowCropUrl(row);
              return (
              <li key={`crop-${row.cnic}`} className="flex items-start justify-between gap-2 break-all">
                <span className="min-w-0 flex-1">{row.cropParams}</span>
                {cropUrl ? (
                  <a
                    href={cropUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 rounded p-0.5 text-indigo-600 hover:bg-indigo-50"
                    title={cropUrl}
                  >
                    <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                  </a>
                ) : null}
              </li>
            );
            })}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-gray-400">—</p>
        )}
      </div>
      <div className="px-4 py-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Parsed fields</h4>
      </div>
      <div className="max-h-[30vh] overflow-auto">
        {voters.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-gray-500">No parsed voter fields.</p>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="sticky top-0 bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Name</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Father</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Age</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {voterTableRows.map((row) => (
                <tr key={`detail-${row.cnic}`} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-700">{row.name || '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{row.father_name || '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-500">{row.age || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
