'use client';

import { useCallback, useRef, useState } from 'react';
import type { ParchiCanvasConfig } from '@/lib/voter-parchi/types';

const MAX_UNDO = 10;

export type CanvasSnapshot = Pick<
  ParchiCanvasConfig,
  'elements' | 'slipWidthMm' | 'slipHeightMm' | 'slipAspectRatio' | 'backgroundColor' | 'backgroundAssetId'
>;

function cloneSnapshot(canvas: ParchiCanvasConfig): CanvasSnapshot {
  return {
    elements: JSON.parse(JSON.stringify(canvas.elements)) as ParchiCanvasConfig['elements'],
    slipWidthMm: canvas.slipWidthMm,
    slipHeightMm: canvas.slipHeightMm,
    slipAspectRatio: canvas.slipAspectRatio,
    backgroundColor: canvas.backgroundColor,
    backgroundAssetId: canvas.backgroundAssetId,
  };
}

export function useCanvasHistory() {
  const stackRef = useRef<CanvasSnapshot[]>([]);
  const [canUndo, setCanUndo] = useState(false);

  const resetHistory = useCallback((canvas: ParchiCanvasConfig) => {
    stackRef.current = [cloneSnapshot(canvas)];
    setCanUndo(false);
  }, []);

  const recordHistory = useCallback((canvas: ParchiCanvasConfig) => {
    const snap = cloneSnapshot(canvas);
    const stack = stackRef.current;
    const last = stack[stack.length - 1];
    if (last && JSON.stringify(last) === JSON.stringify(snap)) return;

    const next = [...stack, snap];
    if (next.length > MAX_UNDO + 1) {
      next.shift();
    }
    stackRef.current = next;
    setCanUndo(next.length > 1);
  }, []);

  const undo = useCallback((): CanvasSnapshot | null => {
    const stack = stackRef.current;
    if (stack.length <= 1) return null;
    stack.pop();
    const previous = stack[stack.length - 1];
    setCanUndo(stack.length > 1);
    return previous ? cloneSnapshot(previous as ParchiCanvasConfig) : null;
  }, []);

  return { canUndo, resetHistory, recordHistory, undo };
}
