'use client';

import type { ParchiBorderStyle } from '@/lib/voter-parchi/types';
import { PARCHI_BORDER_STYLE_OPTIONS } from '@/lib/voter-parchi/border-style';
import type { ParchiShapePreset } from '@/components/parchi-designer/canvas-element';

interface ShapeToolboxButtonProps {
  shape: ParchiShapePreset;
  disabled?: boolean;
  onClick: () => void;
}

export function ShapeToolboxButton({ shape, disabled, onClick }: ShapeToolboxButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={shape === 'box' ? 'Filled box' : shape === 'rectangle' ? 'Rectangle outline' : 'Circle'}
      className="flex h-12 items-center justify-center rounded-lg border border-slate-200 bg-white transition hover:border-indigo-300 hover:bg-indigo-50 disabled:opacity-50"
    >
      <ShapePreview shape={shape} />
    </button>
  );
}

export function ShapePreview({ shape, className = '' }: { shape: ParchiShapePreset; className?: string }) {
  if (shape === 'box') {
    return <div className={`h-6 w-9 rounded-sm bg-[#00401A] shadow-sm ${className}`} />;
  }
  if (shape === 'rectangle') {
    return <div className={`h-6 w-9 rounded-sm border-2 border-[#00401A] bg-transparent ${className}`} />;
  }
  return <div className={`h-7 w-7 rounded-full border-2 border-[#00401A] bg-slate-200 ${className}`} />;
}

function LineStylePreview({ style }: { style: ParchiBorderStyle }) {
  const dasharray = style === 'dashed' ? '7 4' : style === 'dotted' ? '2 3' : undefined;
  return (
    <svg viewBox="0 0 48 12" className="h-3 w-full text-slate-700" aria-hidden>
      <line
        x1="4"
        y1="6"
        x2="44"
        y2="6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={dasharray}
      />
    </svg>
  );
}

export function LineStyleButtons({
  value = 'solid',
  disabled,
  compact,
  onChange,
}: {
  value?: ParchiBorderStyle;
  disabled?: boolean;
  compact?: boolean;
  onChange: (style: ParchiBorderStyle) => void;
}) {
  return (
    <div className={`grid grid-cols-3 ${compact ? 'gap-1' : 'gap-1.5'}`}>
      {PARCHI_BORDER_STYLE_OPTIONS.map((option) => {
        const active = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            disabled={disabled}
            title={option.label}
            onClick={() => onChange(option.id)}
            className={`rounded-lg border transition ${
              compact ? 'px-1.5 py-1.5' : 'px-2 py-2'
            } ${
              active
                ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-300'
                : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50'
            } disabled:opacity-50`}
          >
            <LineStylePreview style={option.id} />
            {!compact ? (
              <span className="mt-1 block text-[10px] font-medium text-slate-600">{option.label}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
