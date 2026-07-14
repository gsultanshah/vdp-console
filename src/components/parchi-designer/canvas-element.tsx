'use client';

import type { CSSProperties } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import type {
  ParchiCanvasElement,
  ParchiElementDragMode,
  ParchiFieldId,
  ParchiVoterRecord,
  VoterParchiDesign,
} from '@/lib/voter-parchi/types';
import { PARCHI_FIELD_DEFINITIONS } from '@/lib/voter-parchi/types';
import { fieldLabel, resolveCanvasAssetUrl, resolvePreviewAssetUrl, resolvePreviewFieldValue, SAMPLE_PARCHI_VOTER } from '@/lib/voter-parchi/canvas-utils';
import { RESIZE_HANDLES } from '@/components/parchi-designer/resize-handles';
import type { ParchiElementImageUploadState } from '@/lib/voter-parchi/parchi-image-upload';

interface CanvasElementViewProps {
  element: ParchiCanvasElement;
  design: VoterParchiDesign;
  previewVoter?: ParchiVoterRecord;
  selected: boolean;
  primary?: boolean;
  interactive?: boolean;
  onSelect: (options?: { additive?: boolean }) => void;
  onPointerDown: (event: React.PointerEvent, mode: ParchiElementDragMode) => void;
  onDelete?: () => void;
  onImageDoubleClick?: () => void;
  imageUpload?: ParchiElementImageUploadState;
}

function elementStyleBase(el: ParchiCanvasElement): CSSProperties {
  const s = el.style ?? {};
  const isCircle = el.type === 'circle';
  return {
    backgroundColor: s.backgroundColor,
    color: s.color ?? '#111',
    fontSize: s.fontSize ? `${s.fontSize}px` : '12px',
    fontWeight: s.fontWeight ?? 'normal',
    textAlign: s.textAlign ?? 'right',
    border:
      s.borderWidth && s.borderColor ? `${s.borderWidth}px solid ${s.borderColor}` : s.borderColor ? `1px solid ${s.borderColor}` : undefined,
    borderRadius: isCircle ? '50%' : s.borderRadius ? `${s.borderRadius}px` : undefined,
    padding: s.padding ? `${s.padding}px` : undefined,
    opacity: s.opacity ?? 1,
    overflow: 'hidden',
  };
}

function imageSrc(design: VoterParchiDesign, el: ParchiCanvasElement, voter: ParchiVoterRecord): string | null {
  if (el.assetId) return resolveCanvasAssetUrl(design, el.assetId);
  const fieldId = el.imageFieldId;
  if (!fieldId) return null;
  if (fieldId === 'rowCrop') return voter.rowCropUrl;
  if (fieldId === 'symbol' || fieldId === 'photo') return resolvePreviewAssetUrl(design, fieldId);
  return null;
}

export function CanvasElementView({
  element,
  design,
  previewVoter,
  selected,
  primary = false,
  interactive = true,
  onSelect,
  onPointerDown,
  onDelete,
  onImageDoubleClick,
  imageUpload,
}: CanvasElementViewProps) {
  const voter = previewVoter ?? SAMPLE_PARCHI_VOTER;
  const isShape = element.type === 'rect' || element.type === 'circle';
  const baseStyle: CSSProperties = {
    position: 'absolute',
    left: `${element.x}%`,
    top: `${element.y}%`,
    width: `${element.w}%`,
    height: `${element.h}%`,
    zIndex: element.zIndex,
    cursor: interactive ? 'move' : 'default',
    pointerEvents: interactive ? 'auto' : 'none',
    touchAction: interactive ? 'none' : 'auto',
    boxSizing: 'border-box',
    ...elementStyleBase(element),
  };

  const content = (() => {
    if (isShape) {
      return null;
    }
    if (element.type === 'text') {
      return <div className="h-full w-full leading-snug">{element.text}</div>;
    }
    if (element.type === 'field') {
      const value = element.fieldId
        ? resolvePreviewFieldValue(element.fieldId, voter, design)
        : '';
      return <div className="h-full w-full leading-snug">{value || '—'}</div>;
    }
    if (element.type === 'labelValue') {
      const label =
        element.showLabel !== false
          ? fieldLabel(element.fieldId ?? '', element.label, element.labelUrdu)
          : '';
      const value = element.fieldId
        ? resolvePreviewFieldValue(element.fieldId, voter, design)
        : '';
      return (
        <div className="flex h-full w-full flex-col justify-start leading-snug">
          {label ? <div className="text-[0.85em] font-semibold text-emerald-900">{label}</div> : null}
          <div className="flex-1">{value || '—'}</div>
        </div>
      );
    }
    if (element.type === 'image') {
      const src = imageUpload?.previewUrl ?? imageSrc(design, element, voter);
      const label =
        PARCHI_FIELD_DEFINITIONS.find((f) => f.id === element.imageFieldId)?.label ?? 'Image';
      if (src) {
        return (
          <>
            <img src={src} alt="" className="pointer-events-none h-full w-full object-contain" draggable={false} />
            {onImageDoubleClick && selected ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-slate-900/60 py-0.5 text-center text-[8px] font-medium text-white">
                Double-click to replace
              </div>
            ) : null}
          </>
        );
      }
      return (
        <div className="pointer-events-none flex h-full w-full flex-col items-center justify-center gap-1 bg-slate-100 px-2 text-center text-[10px] text-slate-500">
          <span>{label}</span>
          {onImageDoubleClick ? <span className="text-[9px] text-indigo-500">Double-click to upload</span> : null}
        </div>
      );
    }
    return null;
  })();

  return (
    <div
      style={baseStyle}
      className={selected ? 'ring-2 ring-indigo-500 ring-offset-1' : 'hover:ring-1 hover:ring-indigo-300'}
      onPointerDown={
        interactive
          ? (e) => {
              e.stopPropagation();
              onSelect({ additive: e.shiftKey || e.metaKey || e.ctrlKey });
              onPointerDown(e, 'move');
            }
          : undefined
      }
      onDoubleClick={
        interactive && element.type === 'image' && onImageDoubleClick
          ? (e) => {
              e.stopPropagation();
              e.preventDefault();
              onImageDoubleClick();
            }
          : undefined
      }
    >
      {content}
      {element.type === 'image' && imageUpload ? (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-slate-900/55 px-2 text-white">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          <p className="text-[10px] font-semibold">
            {imageUpload.phase === 'preparing' ? 'Optimizing image…' : 'Uploading…'}
          </p>
          <div className="h-1.5 w-full max-w-[8rem] overflow-hidden rounded-full bg-white/25">
            <div
              className="h-full rounded-full bg-white transition-[width] duration-150"
              style={{ width: `${Math.max(imageUpload.progress, imageUpload.phase === 'preparing' ? 12 : 8)}%` }}
            />
          </div>
          <p className="text-[9px] text-white/80">{imageUpload.progress}%</p>
        </div>
      ) : null}
      {primary && interactive ? (
        <>
          {onDelete ? (
            <button
              type="button"
              className="absolute -right-2 -top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full border border-white bg-red-500 text-white shadow hover:bg-red-600"
              title="Delete element"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              <XMarkIcon className="h-3 w-3" />
            </button>
          ) : null}
          {RESIZE_HANDLES.map(({ handle, className }) => (
            <div
              key={handle}
              className={`absolute z-10 h-2.5 w-2.5 rounded-sm border border-white bg-indigo-600 shadow ${className}`}
              onPointerDown={(e) => {
                e.stopPropagation();
                onPointerDown(e, { kind: 'resize', handle });
              }}
            />
          ))}
        </>
      ) : null}
    </div>
  );
}

export function newCanvasElementId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `el-${Date.now().toString(36)}`;
}

export type ParchiShapePreset = 'box' | 'rectangle' | 'circle';

export function defaultShapeElement(shape: ParchiShapePreset, maxZ: number): ParchiCanvasElement {
  const base = {
    id: newCanvasElementId(),
    x: 20,
    y: 20,
    w: shape === 'circle' ? 18 : 30,
    h: shape === 'circle' ? 18 : 14,
    zIndex: maxZ + 1,
  };

  if (shape === 'circle') {
    return {
      ...base,
      type: 'circle',
      style: {
        backgroundColor: '#E2E8F0',
        borderColor: '#00401A',
        borderWidth: 2,
      },
    };
  }

  if (shape === 'rectangle') {
    return {
      ...base,
      type: 'rect',
      style: {
        backgroundColor: 'transparent',
        borderColor: '#00401A',
        borderWidth: 2,
      },
    };
  }

  return {
    ...base,
    type: 'rect',
    style: {
      backgroundColor: '#00401A',
      borderColor: '#00401A',
      borderWidth: 1,
    },
  };
}

export function defaultElementForType(
  type: ParchiCanvasElement['type'],
  maxZ: number,
  fieldId?: ParchiFieldId
): ParchiCanvasElement {
  const base = {
    id: newCanvasElementId(),
    type,
    x: 15,
    y: 15,
    w: 30,
    h: 8,
    zIndex: maxZ + 1,
    style: {
      backgroundColor: type === 'rect' ? '#00401A' : type === 'circle' ? '#E2E8F0' : type === 'labelValue' ? '#F8FAF8' : undefined,
      color: type === 'text' ? '#00401A' : '#111',
      fontSize: 10,
      textAlign: 'right' as const,
      borderColor: type === 'labelValue' || type === 'circle' ? '#D1D5DB' : undefined,
      borderWidth: type === 'labelValue' ? 1 : type === 'circle' ? 2 : undefined,
      padding: 4,
    },
  };

  if (type === 'labelValue' || type === 'field') {
    return {
      ...base,
      fieldId: fieldId ?? 'name',
      showLabel: type === 'labelValue',
      labelUrdu: PARCHI_FIELD_DEFINITIONS.find((f) => f.id === (fieldId ?? 'name'))?.labelUrdu,
    };
  }
  if (type === 'text') {
    return { ...base, text: 'نیا متن' };
  }
  if (type === 'image') {
    return {
      ...base,
      w: 20,
      h: 20,
      imageFieldId: fieldId ?? 'photo',
      style: { ...base.style, borderColor: '#D1D5DB', borderWidth: 1 },
    };
  }
  if (type === 'circle') {
    return {
      ...base,
      w: 18,
      h: 18,
      style: {
        backgroundColor: '#E2E8F0',
        borderColor: '#00401A',
        borderWidth: 2,
      },
    };
  }
  return base;
}
