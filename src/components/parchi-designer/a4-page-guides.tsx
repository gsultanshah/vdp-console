'use client';

import type { ParchiCanvasConfig, ParchiVoterRecord, VoterParchiDesign } from '@/lib/voter-parchi/types';
import { SAMPLE_PARCHI_VOTER } from '@/lib/voter-parchi/canvas-utils';
import {
  A4_HEIGHT_MM,
  A4_PREVIEW_GAP_MM,
  A4_PREVIEW_MARGIN_MM,
  A4_WIDTH_MM,
  getA4CellSizeMm,
  getParchiPageGrid,
  resolveSlipSizeMm,
} from '@/lib/voter-parchi/canvas-layout';
import { A4SlipSlot } from '@/components/parchi-designer/a4-slip-slot';

interface A4PageGuidesProps {
  design: VoterParchiDesign;
  canvas: ParchiCanvasConfig;
  previewVoters?: ParchiVoterRecord[];
  parchiPerPage: number;
  className?: string;
}

export default function A4PageGuides({
  design,
  canvas,
  previewVoters = [],
  parchiPerPage,
  className,
}: A4PageGuidesProps) {
  const { cols, rows } = getParchiPageGrid(parchiPerPage);
  const slip = resolveSlipSizeMm(canvas);
  const slots = Math.max(1, Math.min(5, parchiPerPage));
  const { cellWidthMm, cellHeightMm } = getA4CellSizeMm(parchiPerPage, {
    marginMm: A4_PREVIEW_MARGIN_MM,
    gapMm: A4_PREVIEW_GAP_MM,
  });

  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">A4 print sheet</p>
        <p className="text-[10px] font-medium text-slate-400">
          {A4_WIDTH_MM}×{A4_HEIGHT_MM} mm
        </p>
      </div>
      <div
        className="relative flex h-full w-full flex-col overflow-hidden rounded-lg border-2 border-slate-400 bg-white shadow-inner"
        style={{ aspectRatio: `${A4_WIDTH_MM}/${A4_HEIGHT_MM}` }}
      >
        <div className="absolute left-2 top-2 z-10 rounded bg-slate-800/80 px-1.5 py-0.5 text-[9px] font-bold text-white">
          A4
        </div>
        <div
          className="grid h-full w-full pt-6"
          style={{
            padding: `${(A4_PREVIEW_MARGIN_MM / A4_HEIGHT_MM) * 100}% ${(A4_PREVIEW_MARGIN_MM / A4_WIDTH_MM) * 100}%`,
            gap: `${(A4_PREVIEW_GAP_MM / A4_WIDTH_MM) * 100}%`,
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
          }}
        >
          {Array.from({ length: slots }).map((_, index) => (
            <A4SlipSlot
              key={index}
              design={design}
              canvas={canvas}
              previewVoter={previewVoters[index] ?? previewVoters[0] ?? SAMPLE_PARCHI_VOTER}
              slipWidthMm={slip.widthMm}
              slipHeightMm={slip.heightMm}
              cellWidthMm={cellWidthMm}
              cellHeightMm={cellHeightMm}
              index={index}
            />
          ))}
        </div>
      </div>
      <p className="mt-2 text-center text-[10px] text-slate-500">
        {slots} parchi per page · slip {slip.widthMm.toFixed(0)}×{slip.heightMm.toFixed(0)} mm · cell{' '}
        {cellWidthMm.toFixed(0)}×{cellHeightMm.toFixed(0)} mm · {cols}×{rows} layout
      </p>
    </div>
  );
}
