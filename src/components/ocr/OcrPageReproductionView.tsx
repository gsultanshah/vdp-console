'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { OcrDataPayload, OcrProcessedRow, OcrVoterRow } from '@/lib/ocr-pipeline';

interface VisionAnnotation {
  description?: string | null;
  boundingPoly?: {
    vertices?: { x?: number; y?: number }[];
  };
}

interface OcrPageReproductionViewProps {
  imageUrl: string;
  ocrData: OcrDataPayload;
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
}: OcrPageReproductionViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [scale, setScale] = useState(1);
  const [showBoxes, setShowBoxes] = useState(false);
  const [showImage, setShowImage] = useState(true);
  const [viewMode, setViewMode] = useState<'overlay' | 'rows'>('overlay');

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

  const rowColors = useMemo(() => {
    const rows = ocrData.processedRows ?? [];
    return rows.map((_, i) => `hsla(${(i * 47) % 360}, 70%, 82%, 0.35)`);
  }, [ocrData.processedRows]);

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
          Page {pageSize.width}×{pageSize.height}px · {annotations.length} OCR tokens · skew{' '}
          {ocrData.skewAngle?.toFixed(4) ?? '0'} rad
        </div>
      </div>

      <VoterDataPanel voters={ocrData.finalJson ?? []} processedRows={ocrData.processedRows ?? []} />
    </div>
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
  voters,
  processedRows,
}: {
  voters: OcrVoterRow[];
  processedRows: OcrProcessedRow[];
}) {
  return (
    <div className="w-full shrink-0 rounded-lg border border-gray-200 bg-white shadow-sm lg:w-96">
      <div className="border-b border-gray-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900">Extracted voters</h3>
        <p className="text-xs text-gray-500">
          {voters.length} rows from OCR · {processedRows.length} detected bands
        </p>
      </div>
      <div className="max-h-[70vh] overflow-auto">
        {voters.length === 0 ? (
          <p className="p-4 text-sm text-gray-500">No voter rows parsed from this page.</p>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="sticky top-0 bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">#</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Silsila</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Name</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">CNIC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {voters.map((v) => (
                <tr key={`${v.row}-${v.silsila_no}`} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-3 py-2 text-gray-500">{v.row}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-medium text-gray-900">{v.silsila_no}</td>
                  <td className="px-3 py-2 text-gray-700">{v.gharana_no}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-gray-600">{v.cnic || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
