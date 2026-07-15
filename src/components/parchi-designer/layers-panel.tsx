'use client';

import { useMemo, useState } from 'react';
import { Bars3Icon, TrashIcon } from '@heroicons/react/24/outline';
import type { ParchiCanvasElement } from '@/lib/voter-parchi/types';
import {
  applyLayerOrder,
  layersTopFirst,
  reorderLayerIds,
} from '@/lib/voter-parchi/layer-order';

interface LayersPanelProps {
  elements: ParchiCanvasElement[];
  selectedIds: string[];
  isAdmin: boolean;
  onSelect: (id: string, options?: { additive?: boolean }) => void;
  onDelete: (id: string) => void;
  onReorder: (elements: ParchiCanvasElement[]) => void;
}

export function LayersPanel({
  elements,
  selectedIds,
  isAdmin,
  onSelect,
  onDelete,
  onReorder,
}: LayersPanelProps) {
  const ordered = useMemo(() => layersTopFirst(elements), [elements]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const commitReorder = (draggedId: string, targetId: string) => {
    const topFirstIds = ordered.map((el) => el.id);
    const nextIds = reorderLayerIds(topFirstIds, draggedId, targetId);
    if (nextIds.join('|') === topFirstIds.join('|')) return;
    onReorder(applyLayerOrder(elements, nextIds));
  };

  const endDrag = () => {
    setDraggingId(null);
    setDropTargetId(null);
  };

  return (
    <div className="max-h-36 space-y-0.5 overflow-y-auto">
      {ordered.map((el) => {
        const isSelected = selectedIds.includes(el.id);
        const isDragging = draggingId === el.id;
        const isDropTarget = dropTargetId === el.id && draggingId !== el.id;

        return (
          <div
            key={el.id}
            onDragOver={(event) => {
              if (!isAdmin || !draggingId) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              setDropTargetId(el.id);
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (!isAdmin || !draggingId) return;
              commitReorder(draggingId, el.id);
              endDrag();
            }}
            className={`flex w-full items-center gap-0.5 rounded-md px-0.5 py-0.5 transition-colors ${
              isDropTarget
                ? 'bg-indigo-200 ring-1 ring-indigo-400'
                : isSelected
                  ? 'bg-indigo-100'
                  : 'hover:bg-slate-100'
            } ${isDragging ? 'opacity-40' : ''}`}
          >
            {isAdmin ? (
              <button
                type="button"
                draggable
                title="Drag to reorder layer"
                aria-label="Drag to reorder layer"
                onDragStart={(event) => {
                  setDraggingId(el.id);
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', el.id);
                }}
                onDragEnd={endDrag}
                className="shrink-0 cursor-grab rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600 active:cursor-grabbing"
              >
                <Bars3Icon className="h-3.5 w-3.5" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={(e) => onSelect(el.id, { additive: e.shiftKey || e.metaKey || e.ctrlKey })}
              className={`min-w-0 flex-1 truncate px-1 py-1 text-left text-xs ${
                isSelected ? 'text-indigo-900' : 'text-slate-700'
              }`}
            >
              {el.type}
              {el.fieldId ? ` · ${el.fieldId}` : ''}
              <span className="ml-1 text-slate-400">z{el.zIndex}</span>
            </button>
            {isAdmin ? (
              <button
                type="button"
                onClick={() => onDelete(el.id)}
                className="shrink-0 rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600"
                title="Delete layer"
              >
                <TrashIcon className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
