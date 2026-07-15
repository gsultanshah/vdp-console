'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ParchiResizeHandle } from '@/lib/voter-parchi/types';
import { applyCanvasSizeResize, CANVAS_RESIZE_HANDLE_DEFS } from '@/components/parchi-designer/canvas-resize';

interface CanvasResizeOverlayProps {
  widthMm: number;
  heightMm: number;
  disabled?: boolean;
  onResizeStart?: () => void;
  onResize: (widthMm: number, heightMm: number) => void;
  onResizeCommit?: (widthMm: number, heightMm: number) => void;
}

interface CanvasResizeDrag {
  handle: ParchiResizeHandle;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startWidthMm: number;
  startHeightMm: number;
  frameWidth: number;
  frameHeight: number;
}

export function CanvasResizeOverlay({
  widthMm,
  heightMm,
  disabled,
  onResizeStart,
  onResize,
  onResizeCommit,
}: CanvasResizeOverlayProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<CanvasResizeDrag | null>(null);
  const [liveSize, setLiveSize] = useState<{ widthMm: number; heightMm: number } | null>(null);

  const endDrag = useCallback(
    (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;

      const frame = frameRef.current;
      if (frame) {
        try {
          frame.releasePointerCapture(event.pointerId);
        } catch {
          // ignore
        }
      }

      const next = applyCanvasSizeResize(
        { widthMm: drag.startWidthMm, heightMm: drag.startHeightMm },
        drag.handle,
        event.clientX - drag.startClientX,
        event.clientY - drag.startClientY,
        { width: drag.frameWidth, height: drag.frameHeight }
      );
      onResizeCommit?.(next.widthMm, next.heightMm);
      dragRef.current = null;
      setLiveSize(null);
    },
    [onResizeCommit]
  );

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      event.preventDefault();
      const next = applyCanvasSizeResize(
        { widthMm: drag.startWidthMm, heightMm: drag.startHeightMm },
        drag.handle,
        event.clientX - drag.startClientX,
        event.clientY - drag.startClientY,
        { width: drag.frameWidth, height: drag.frameHeight }
      );
      setLiveSize(next);
      onResize(next.widthMm, next.heightMm);
    };

    const onUp = (event: PointerEvent) => endDrag(event);

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [endDrag, onResize]);

  const displayW = liveSize?.widthMm ?? widthMm;
  const displayH = liveSize?.heightMm ?? heightMm;

  if (disabled) return null;

  return (
    <div ref={frameRef} className="pointer-events-none absolute inset-0 z-20">
      <div className="pointer-events-none absolute inset-0 rounded-md ring-2 ring-amber-400/80 ring-offset-1 ring-offset-transparent" />
      <div className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 rounded bg-amber-600 px-2 py-0.5 text-[10px] font-semibold text-white shadow">
        {displayW.toFixed(0)} × {displayH.toFixed(0)} mm
      </div>
      {CANVAS_RESIZE_HANDLE_DEFS.map(({ handle, className }) => (
        <button
          key={handle}
          type="button"
          aria-label={`Resize canvas ${handle}`}
          className={`pointer-events-auto absolute z-30 h-3.5 w-3.5 rounded-full border-2 border-white bg-amber-500 shadow-md hover:scale-110 hover:bg-amber-600 ${className}`}
          onPointerDown={(event) => {
            event.stopPropagation();
            event.preventDefault();
            const frame = frameRef.current;
            if (!frame) return;
            const rect = frame.getBoundingClientRect();
            onResizeStart?.();
            dragRef.current = {
              handle,
              pointerId: event.pointerId,
              startClientX: event.clientX,
              startClientY: event.clientY,
              startWidthMm: widthMm,
              startHeightMm: heightMm,
              frameWidth: rect.width,
              frameHeight: rect.height,
            };
            try {
              frame.setPointerCapture(event.pointerId);
            } catch {
              // continue without capture
            }
          }}
        />
      ))}
    </div>
  );
}
