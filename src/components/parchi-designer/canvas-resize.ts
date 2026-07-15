import type { ParchiResizeHandle } from '@/lib/voter-parchi/types';
import { A4_HEIGHT_MM, A4_WIDTH_MM, clampSlipSizeMm } from '@/lib/voter-parchi/canvas-layout';

const CANVAS_RESIZE_HANDLES: ParchiResizeHandle[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];

export const CANVAS_RESIZE_HANDLE_DEFS: { handle: ParchiResizeHandle; className: string }[] =
  CANVAS_RESIZE_HANDLES.map((handle) => {
    const positions: Record<ParchiResizeHandle, string> = {
      nw: 'left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nw-resize',
      n: 'left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-n-resize',
      ne: 'right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-ne-resize',
      e: 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2 cursor-e-resize',
      se: 'right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-se-resize',
      s: 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 cursor-s-resize',
      sw: 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-sw-resize',
      w: 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-w-resize',
    };
    return { handle, className: positions[handle] };
  });

export function applyCanvasSizeResize(
  start: { widthMm: number; heightMm: number },
  handle: ParchiResizeHandle,
  deltaPxX: number,
  deltaPxY: number,
  framePx: { width: number; height: number }
): { widthMm: number; heightMm: number } {
  if (framePx.width <= 0 || framePx.height <= 0) {
    return clampSlipSizeMm(start.widthMm, start.heightMm);
  }

  const mmPerPxX = start.widthMm / framePx.width;
  const mmPerPxY = start.heightMm / framePx.height;
  let widthMm = start.widthMm;
  let heightMm = start.heightMm;

  if (handle.includes('e')) widthMm += deltaPxX * mmPerPxX;
  if (handle.includes('w')) widthMm -= deltaPxX * mmPerPxX;
  if (handle.includes('s')) heightMm += deltaPxY * mmPerPxY;
  if (handle.includes('n')) heightMm -= deltaPxY * mmPerPxY;

  return clampSlipSizeMm(widthMm, heightMm);
}

export function canvasResizeLimits() {
  return { minMm: 20, maxWidthMm: A4_WIDTH_MM, maxHeightMm: A4_HEIGHT_MM };
}
