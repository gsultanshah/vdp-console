import type { ParchiCanvasElement, ParchiResizeHandle } from '@/lib/voter-parchi/types';

const MIN_W = 4;
const MIN_H = 3;

export const RESIZE_HANDLES: { handle: ParchiResizeHandle; className: string }[] = [
  { handle: 'nw', className: 'left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nw-resize' },
  { handle: 'n', className: 'left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-n-resize' },
  { handle: 'ne', className: 'right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-ne-resize' },
  { handle: 'e', className: 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2 cursor-e-resize' },
  { handle: 'se', className: 'right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-se-resize' },
  { handle: 's', className: 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 cursor-s-resize' },
  { handle: 'sw', className: 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-sw-resize' },
  { handle: 'w', className: 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-w-resize' },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function applyElementResize(
  start: Pick<ParchiCanvasElement, 'x' | 'y' | 'w' | 'h'>,
  dx: number,
  dy: number,
  handle: ParchiResizeHandle
): Pick<ParchiCanvasElement, 'x' | 'y' | 'w' | 'h'> {
  let x = start.x;
  let y = start.y;
  let w = start.w;
  let h = start.h;

  if (handle.includes('e')) w = start.w + dx;
  if (handle.includes('w')) {
    w = start.w - dx;
    x = start.x + dx;
  }
  if (handle.includes('s')) h = start.h + dy;
  if (handle.includes('n')) {
    h = start.h - dy;
    y = start.y + dy;
  }

  if (w < MIN_W) {
    if (handle.includes('w')) x = start.x + start.w - MIN_W;
    w = MIN_W;
  }
  if (h < MIN_H) {
    if (handle.includes('n')) y = start.y + start.h - MIN_H;
    h = MIN_H;
  }

  x = clamp(x, 0, 100 - MIN_W);
  y = clamp(y, 0, 100 - MIN_H);
  w = clamp(w, MIN_W, 100 - x);
  h = clamp(h, MIN_H, 100 - y);

  return { x, y, w, h };
}
