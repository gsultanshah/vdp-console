'use client';

import type { ParchiCanvasConfig, ParchiCanvasElement, ParchiElementDragMode, ParchiVoterRecord, VoterParchiDesign } from '@/lib/voter-parchi/types';
import { resolveCanvasAssetUrl, sortCanvasElements } from '@/lib/voter-parchi/canvas-utils';
import { CanvasElementView } from '@/components/parchi-designer/canvas-element';
import type { ParchiElementImageUploadState } from '@/lib/voter-parchi/parchi-image-upload';

interface SlipSurfaceProps {
  design: VoterParchiDesign;
  canvas: ParchiCanvasConfig;
  previewVoter?: ParchiVoterRecord;
  editable?: boolean;
  selectedIds?: string[];
  primarySelectedId?: string | null;
  onSelect?: (id: string | null, options?: { additive?: boolean }) => void;
  onPointerDown?: (event: React.PointerEvent, elementId: string, mode: ParchiElementDragMode) => void;
  onDeleteElement?: (elementId: string) => void;
  onImageDoubleClick?: (elementId: string) => void;
  elementImageUploads?: Record<string, ParchiElementImageUploadState>;
  slipRef?: React.RefObject<HTMLDivElement | null>;
}

export function SlipSurface({
  design,
  canvas,
  previewVoter,
  editable = false,
  selectedIds = [],
  primarySelectedId = null,
  onSelect = () => {},
  onPointerDown = () => {},
  onDeleteElement,
  onImageDoubleClick,
  elementImageUploads,
  slipRef,
}: SlipSurfaceProps) {
  const bgUrl = resolveCanvasAssetUrl(design, canvas.backgroundAssetId);
  const elements = sortCanvasElements(canvas.elements);

  return (
    <div
      ref={slipRef}
      className="relative h-full w-full overflow-hidden rounded-md border border-slate-300/80 shadow-sm"
      style={{
        backgroundColor: canvas.backgroundColor ?? '#fff',
        backgroundImage: bgUrl ? `url(${bgUrl})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
      onPointerDown={editable ? () => onSelect(null) : undefined}
    >
      {elements.map((element) => (
        <CanvasElementView
          key={element.id}
          element={element}
          design={design}
          previewVoter={previewVoter}
          selected={editable && selectedIds.includes(element.id)}
          primary={editable && primarySelectedId === element.id}
          interactive={editable}
          onSelect={(options) => onSelect(element.id, options)}
          onPointerDown={(event, mode) => onPointerDown(event, element.id, mode)}
          onDelete={onDeleteElement ? () => onDeleteElement(element.id) : undefined}
          onImageDoubleClick={
            onImageDoubleClick && element.type === 'image' ? () => onImageDoubleClick(element.id) : undefined
          }
          imageUpload={elementImageUploads?.[element.id]}
        />
      ))}
    </div>
  );
}

export type { ParchiCanvasElement };
