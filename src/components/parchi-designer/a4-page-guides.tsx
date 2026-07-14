'use client';

import type { ParchiCanvasConfig, ParchiVoterRecord, VoterParchiDesign } from '@/lib/voter-parchi/types';
import { SAMPLE_PARCHI_VOTER } from '@/lib/voter-parchi/canvas-utils';
import {
  A4_HEIGHT_MM,
  A4_WIDTH_MM,
  getParchiPageGrid,
  resolveSlipSizeMm,
} from '@/lib/voter-parchi/canvas-layout';
import { SlipSurface } from '@/components/parchi-designer/slip-surface';

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
          className="grid h-full w-full gap-[3px] p-2 pt-6"
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
          }}
        >
          {Array.from({ length: slots }).map((_, index) => (
            <div
              key={index}
              className="relative min-h-0 min-w-0 overflow-hidden rounded border-2 border-dashed border-indigo-400/70 bg-indigo-50/20"
            >
              <div className="absolute left-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white shadow">
                {index + 1}
              </div>
              <div className="absolute bottom-0.5 right-1 z-10 text-[8px] font-medium text-slate-400">
                {slip.widthMm.toFixed(0)}×{slip.heightMm.toFixed(0)}
              </div>
              <div className="absolute inset-1 top-6">
                <SlipSurface
                  design={design}
                  canvas={canvas}
                  previewVoter={previewVoters[index] ?? previewVoters[0] ?? SAMPLE_PARCHI_VOTER}
                  editable={false}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-2 text-center text-[10px] text-slate-500">
        {slots} voter parchi per page · {cols}×{rows} layout
      </p>
    </div>
  );
}
