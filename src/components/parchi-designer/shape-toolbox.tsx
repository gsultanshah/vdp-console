'use client';

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
