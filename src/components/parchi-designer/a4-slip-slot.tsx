'use client';

import { useEffect, useRef, useState } from 'react';
import type { ParchiCanvasConfig, ParchiVoterRecord, VoterParchiDesign } from '@/lib/voter-parchi/types';
import { fitSlipInCell } from '@/lib/voter-parchi/canvas-layout';
import { SlipSurface } from '@/components/parchi-designer/slip-surface';

interface A4SlipSlotProps {
  design: VoterParchiDesign;
  canvas: ParchiCanvasConfig;
  previewVoter?: ParchiVoterRecord;
  slipWidthMm: number;
  slipHeightMm: number;
  cellWidthMm: number;
  cellHeightMm: number;
  index: number;
}

export function A4SlipSlot({
  design,
  canvas,
  previewVoter,
  slipWidthMm,
  slipHeightMm,
  cellWidthMm,
  cellHeightMm,
  index,
}: A4SlipSlotProps) {
  const cellRef = useRef<HTMLDivElement>(null);
  const [cellPx, setCellPx] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = cellRef.current;
    if (!node) return;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      setCellPx({ width: rect.width, height: rect.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const fitted = fitSlipInCell(cellWidthMm, cellHeightMm, slipWidthMm, slipHeightMm);
  const scaleX = cellPx.width > 0 ? cellPx.width / cellWidthMm : 1;
  const scaleY = cellPx.height > 0 ? cellPx.height / cellHeightMm : 1;
  const slipW = fitted.w * scaleX;
  const slipH = fitted.h * scaleY;
  const left = fitted.offsetX * scaleX;
  const top = fitted.offsetY * scaleY;
  const fillsCell = fitted.w >= cellWidthMm * 0.98 && fitted.h >= cellHeightMm * 0.98;

  return (
    <div
      ref={cellRef}
      className="relative min-h-0 min-w-0 overflow-hidden rounded border-2 border-dashed border-indigo-400/70 bg-indigo-50/20"
    >
      <div className="absolute left-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white shadow">
        {index + 1}
      </div>
      <div className="absolute bottom-0.5 right-1 z-10 max-w-[calc(100%-1.5rem)] truncate text-[8px] font-medium text-slate-500">
        {slipWidthMm.toFixed(0)}×{slipHeightMm.toFixed(0)} mm
        {!fillsCell ? ` · cell ${cellWidthMm.toFixed(0)}×${cellHeightMm.toFixed(0)}` : ''}
      </div>
      {cellPx.width > 0 && cellPx.height > 0 ? (
        <div
          className="absolute overflow-hidden rounded-sm border border-slate-300/80 bg-white shadow-sm"
          style={{ left, top, width: slipW, height: slipH }}
        >
          <SlipSurface design={design} canvas={canvas} previewVoter={previewVoter} editable={false} />
        </div>
      ) : null}
    </div>
  );
}
