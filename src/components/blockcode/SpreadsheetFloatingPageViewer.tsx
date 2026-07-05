'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowTopRightOnSquareIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

export interface FloatingPageOption {
  id: string;
  url: string;
  fileName: string;
}

interface SpreadsheetFloatingPageViewerProps {
  isOpen: boolean;
  onClose?: () => void;
  imageUrl: string | null;
  fileName?: string | null;
  pages?: FloatingPageOption[];
  pageIndex?: number;
  onPageChange?: (index: number) => void;
  highlightRow?: {
    rowY: number;
    rowHeight: number;
    pageHeight: number;
  } | null;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

export default function SpreadsheetFloatingPageViewer({
  isOpen,
  onClose,
  imageUrl,
  fileName,
  pages = [],
  pageIndex = 0,
  onPageChange,
  highlightRow,
}: SpreadsheetFloatingPageViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    }
  }, [isOpen]);

  const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: offset.x,
        originY: offset.y,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [offset.x, offset.y]
  );

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    setOffset({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    });
  }, []);

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  if (!isOpen || !imageUrl) {
    return null;
  }

  const highlightTop =
    highlightRow && highlightRow.pageHeight > 0
      ? `${((highlightRow.rowY / highlightRow.pageHeight) * 100).toFixed(3)}%`
      : null;
  const highlightHeight =
    highlightRow && highlightRow.pageHeight > 0
      ? `${((highlightRow.rowHeight / highlightRow.pageHeight) * 100).toFixed(3)}%`
      : null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[70]"
      aria-hidden={!isOpen}
    >
      <div
        className="pointer-events-auto absolute right-4 top-20 flex w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-2xl"
        style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
      >
        <div
          className="flex cursor-grab items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2 active:cursor-grabbing"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <div className="min-w-0 select-none">
            <p className="truncate text-xs font-semibold uppercase tracking-wide text-gray-700">Page scan</p>
            <p className="truncate text-xs text-gray-500">{fileName ?? 'Scanned page'}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => setZoom((value) => clampZoom(value - ZOOM_STEP))}
              className="rounded p-1.5 text-gray-600 hover:bg-gray-200"
              title="Zoom out"
              aria-label="Zoom out"
            >
              <MagnifyingGlassMinusIcon className="h-4 w-4" />
            </button>
            <span className="min-w-[3rem] text-center text-xs tabular-nums text-gray-600">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => setZoom((value) => clampZoom(value + ZOOM_STEP))}
              className="rounded p-1.5 text-gray-600 hover:bg-gray-200"
              title="Zoom in"
              aria-label="Zoom in"
            >
              <MagnifyingGlassPlusIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => setZoom(1)}
              className="rounded px-1.5 py-1 text-xs text-gray-600 hover:bg-gray-200"
              title="Reset zoom"
            >
              Reset
            </button>
            <a
              href={imageUrl}
              target="_blank"
              rel="noopener noreferrer"
              onPointerDown={(event) => event.stopPropagation()}
              className="rounded p-1.5 text-indigo-600 hover:bg-indigo-50"
              title="Open in new tab"
            >
              <ArrowTopRightOnSquareIcon className="h-4 w-4" />
            </a>
            {onClose ? (
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={onClose}
                className="rounded p-1.5 text-gray-500 hover:bg-gray-200"
                title="Close page viewer"
                aria-label="Close page viewer"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>

        {pages.length > 1 ? (
          <div className="border-b border-gray-200 px-3 py-2">
            <label className="flex items-center gap-2 text-xs text-gray-600">
              <span className="shrink-0">Page</span>
              <select
                value={pageIndex}
                onChange={(event) => onPageChange?.(Number(event.target.value))}
                className="min-w-0 flex-1 rounded border border-gray-300 bg-white px-2 py-1 text-sm"
              >
                {pages.map((page, index) => (
                  <option key={page.id} value={index}>
                    {page.fileName}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        <div className="max-h-[min(70vh,36rem)] overflow-auto bg-gray-100 p-2">
          <div className="relative inline-block min-w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={fileName ?? 'Scanned page'}
              className="block max-w-none rounded border border-gray-200 bg-white"
              style={{
                width: `${zoom * 100}%`,
                height: 'auto',
              }}
              draggable={false}
            />
            {highlightTop != null && highlightHeight != null ? (
              <div
                className="pointer-events-none absolute left-0 right-0 border-y-2 border-indigo-500 bg-indigo-400/20"
                style={{ top: highlightTop, height: highlightHeight, width: `${zoom * 100}%` }}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
