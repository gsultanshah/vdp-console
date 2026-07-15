'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ParchiCanvasConfig, ParchiCanvasElement, ParchiElementDragMode, ParchiVoterRecord, VoterParchiDesign } from '@/lib/voter-parchi/types';
import { A4_HEIGHT_MM, A4_WIDTH_MM, resolveSlipSizeMm } from '@/lib/voter-parchi/canvas-layout';
import { CanvasResizeOverlay } from '@/components/parchi-designer/canvas-resize-overlay';
import A4PageGuides from '@/components/parchi-designer/a4-page-guides';
import { SlipSurface } from '@/components/parchi-designer/slip-surface';
import { applyElementResize } from '@/components/parchi-designer/resize-handles';
import type { ParchiElementImageUploadState } from '@/lib/voter-parchi/parchi-image-upload';

interface DesignerCanvasProps {
  design: VoterParchiDesign;
  canvas: ParchiCanvasConfig;
  previewVoters?: ParchiVoterRecord[];
  selectedIds: string[];
  primarySelectedId: string | null;
  onSelect: (id: string | null, options?: { additive?: boolean }) => void;
  onElementsChange: (elements: ParchiCanvasElement[]) => void;
  onDragStart?: () => void;
  onDragCommit?: (elements: ParchiCanvasElement[]) => void;
  onDeleteElement?: (elementId: string) => void;
  onImageDoubleClick?: (elementId: string) => void;
  elementImageUploads?: Record<string, ParchiElementImageUploadState>;
  editable?: boolean;
  showA4Guides: boolean;
  parchiPerPage: number;
  onSlipSizeChange?: (widthMm: number, heightMm: number) => void;
  onSlipResizeStart?: () => void;
  onSlipResizeCommit?: (widthMm: number, heightMm: number) => void;
}

type DragMode = ParchiElementDragMode;

interface DragState {
  elementId: string;
  mode: DragMode;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  startW: number;
  startH: number;
  baseElements: ParchiCanvasElement[];
}

interface PendingDrag extends DragState {
  active: boolean;
}

const DRAG_THRESHOLD_PX = 4;
const DOUBLE_CLICK_MS = 450;
const DOUBLE_CLICK_PX = 10;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function fitBox(
  containerW: number,
  containerH: number,
  aspect: number
): { width: number; height: number } {
  if (containerW <= 0 || containerH <= 0) return { width: 0, height: 0 };
  let width = containerW;
  let height = width / aspect;
  if (height > containerH) {
    height = containerH;
    width = height * aspect;
  }
  return { width, height };
}

function applyDrag(
  drag: DragState,
  clientX: number,
  clientY: number,
  rect: DOMRect
): ParchiCanvasElement[] {
  const dx = ((clientX - drag.startClientX) / rect.width) * 100;
  const dy = ((clientY - drag.startClientY) / rect.height) * 100;

  return drag.baseElements.map((el) => {
    if (el.id !== drag.elementId) return el;
    if (drag.mode === 'move') {
      return {
        ...el,
        x: clamp(drag.startX + dx, 0, 100 - drag.startW),
        y: clamp(drag.startY + dy, 0, 100 - drag.startH),
      };
    }
    const resized = applyElementResize(
      { x: drag.startX, y: drag.startY, w: drag.startW, h: drag.startH },
      dx,
      dy,
      drag.mode.handle
    );
    return { ...el, ...resized };
  });
}

export default function DesignerCanvas({
  design,
  canvas,
  previewVoters = [],
  selectedIds,
  primarySelectedId,
  onSelect,
  onElementsChange,
  onDragStart,
  onDragCommit,
  onDeleteElement,
  onImageDoubleClick,
  elementImageUploads,
  editable = true,
  showA4Guides,
  parchiPerPage,
  onSlipSizeChange,
  onSlipResizeStart,
  onSlipResizeCommit,
}: DesignerCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const slipRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const pendingDragRef = useRef<PendingDrag | null>(null);
  const imageClickRef = useRef<{ elementId: string; time: number; x: number; y: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const [dragElements, setDragElements] = useState<ParchiCanvasElement[] | null>(null);
  const [slipFrame, setSlipFrame] = useState({ width: 0, height: 0 });
  const [guidesFrame, setGuidesFrame] = useState({ width: 0, height: 0 });

  const primaryVoter = previewVoters[0];
  const slipSize = resolveSlipSizeMm(canvas);
  const displayElements = dragElements ?? canvas.elements;

  const displayCanvas = useMemo(
    () => ({ ...canvas, elements: displayElements }),
    [canvas, displayElements]
  );

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const measure = () => {
      const rect = node.getBoundingClientRect();
      const pad = 8;

      if (showA4Guides) {
        const halfW = (rect.width - pad) / 2;
        const fullH = rect.height - pad;
        setSlipFrame(fitBox(halfW, fullH, slipSize.aspect));
        setGuidesFrame(fitBox(halfW, fullH, A4_WIDTH_MM / A4_HEIGHT_MM));
      } else {
        setSlipFrame(fitBox(rect.width - pad, rect.height - pad, slipSize.aspect));
        setGuidesFrame({ width: 0, height: 0 });
      }
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [showA4Guides, slipSize.aspect, slipSize.widthMm, slipSize.heightMm]);

  const endDrag = useCallback(
    (elements: ParchiCanvasElement[], pointerId?: number) => {
      const slip = slipRef.current;
      if (slip && pointerId !== undefined) {
        try {
          slip.releasePointerCapture(pointerId);
        } catch {
          // ignore if capture was not set
        }
      }
      dragRef.current = null;
      pendingDragRef.current = null;
      setDragElements(null);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (onDragCommit) {
        onDragCommit(elements);
      } else {
        onElementsChange(elements);
      }
    },
    [onDragCommit, onElementsChange]
  );

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const slip = slipRef.current;
      if (!slip) return;

      const pending = pendingDragRef.current;
      if (pending && event.pointerId === pending.pointerId && !pending.active) {
        const dx = event.clientX - pending.startClientX;
        const dy = event.clientY - pending.startClientY;
        if (Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
          pending.active = true;
          dragRef.current = pending;
          try {
            slip.setPointerCapture(event.pointerId);
          } catch {
            // continue without capture
          }
          onDragStart?.();
          setDragElements(pending.baseElements);
        }
      }

      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;

      event.preventDefault();
      const rect = slip.getBoundingClientRect();
      const next = applyDrag(drag, event.clientX, event.clientY, rect);

      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        setDragElements(next);
        rafRef.current = null;
      });
    };

    const onUp = (event: PointerEvent) => {
      const slip = slipRef.current;
      const drag = dragRef.current;
      const pending = pendingDragRef.current;

      if (drag && event.pointerId === drag.pointerId) {
        if (!slip) {
          endDrag(drag.baseElements, event.pointerId);
          return;
        }
        const rect = slip.getBoundingClientRect();
        const finalElements = applyDrag(drag, event.clientX, event.clientY, rect);
        endDrag(finalElements, event.pointerId);
        return;
      }

      if (pending && !pending.active && event.pointerId === pending.pointerId) {
        const element = canvas.elements.find((el) => el.id === pending.elementId);
        if (element?.type === 'image' && onImageDoubleClick) {
          const now = Date.now();
          const last = imageClickRef.current;
          if (
            last &&
            last.elementId === pending.elementId &&
            now - last.time < DOUBLE_CLICK_MS &&
            Math.hypot(event.clientX - last.x, event.clientY - last.y) < DOUBLE_CLICK_PX
          ) {
            imageClickRef.current = null;
            onImageDoubleClick(pending.elementId);
          } else {
            imageClickRef.current = {
              elementId: pending.elementId,
              time: now,
              x: event.clientX,
              y: event.clientY,
            };
          }
        }
        pendingDragRef.current = null;
      }
    };

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [canvas.elements, endDrag, onDragStart, onImageDoubleClick]);

  const handlePointerDown = (event: React.PointerEvent, elementId: string, mode: DragMode) => {
    if (!editable) return;
    const element = canvas.elements.find((el) => el.id === elementId);
    const slip = slipRef.current;
    if (!element || !slip) return;

    event.stopPropagation();

    const base: DragState = {
      elementId,
      mode,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: element.x,
      startY: element.y,
      startW: element.w,
      startH: element.h,
      baseElements: canvas.elements,
    };

    if (mode !== 'move') {
      event.preventDefault();
      try {
        slip.setPointerCapture(event.pointerId);
      } catch {
        // continue without capture
      }
      onDragStart?.();
      dragRef.current = base;
      pendingDragRef.current = null;
      setDragElements(canvas.elements);
      return;
    }

    pendingDragRef.current = { ...base, active: false };
    dragRef.current = null;
  };

  return (
    <div
      ref={containerRef}
      className={`relative h-full min-h-0 w-full flex-1 overflow-hidden ${dragElements ? 'select-none' : ''}`}
    >
      <div
        className={`absolute inset-0 flex items-center justify-center gap-3 p-2 sm:p-3 ${
          showA4Guides ? 'flex-row' : 'flex-col'
        }`}
      >
        <div
          className={`flex min-h-0 flex-col items-center justify-center ${showA4Guides ? 'min-w-0 flex-1' : 'h-full w-full'}`}
        >
          {showA4Guides ? (
            <div className="mb-1.5 self-start text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Design canvas · {slipSize.widthMm.toFixed(0)}×{slipSize.heightMm.toFixed(0)} mm
            </div>
          ) : null}
          <div
            className="relative max-h-full max-w-full"
            style={{
              width: slipFrame.width > 0 ? slipFrame.width : '100%',
              height: slipFrame.height > 0 ? slipFrame.height : '100%',
            }}
          >
            <SlipSurface
              design={design}
              canvas={displayCanvas}
              previewVoter={primaryVoter}
              editable
              selectedIds={selectedIds}
              primarySelectedId={primarySelectedId}
              onSelect={onSelect}
              onPointerDown={handlePointerDown}
              onDeleteElement={editable ? onDeleteElement : undefined}
              onImageDoubleClick={editable ? onImageDoubleClick : undefined}
              elementImageUploads={elementImageUploads}
              slipRef={slipRef}
            />
            {editable && onSlipSizeChange ? (
              <CanvasResizeOverlay
                widthMm={slipSize.widthMm}
                heightMm={slipSize.heightMm}
                onResizeStart={onSlipResizeStart}
                onResize={onSlipSizeChange}
                onResizeCommit={onSlipResizeCommit}
              />
            ) : null}
          </div>
          {!showA4Guides ? (
            <p className="mt-2 text-[10px] font-medium text-slate-500">
              {slipSize.widthMm.toFixed(0)} × {slipSize.heightMm.toFixed(0)} mm
            </p>
          ) : null}
        </div>

        {showA4Guides ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center">
            <div
              className="w-full max-w-full"
              style={{
                width: guidesFrame.width > 0 ? guidesFrame.width : '100%',
                height: guidesFrame.height > 0 ? guidesFrame.height : 'auto',
              }}
            >
              <A4PageGuides
                design={design}
                canvas={displayCanvas}
                previewVoters={previewVoters}
                parchiPerPage={parchiPerPage}
                className="h-full w-full"
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
