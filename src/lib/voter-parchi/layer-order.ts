import type { ParchiCanvasElement } from '@/lib/voter-parchi/types';
import { sortCanvasElements } from '@/lib/voter-parchi/canvas-utils';

/** Layers listed top-to-front (highest z-index first). */
export function layersTopFirst(elements: ParchiCanvasElement[]): ParchiCanvasElement[] {
  return sortCanvasElements(elements).reverse();
}

/** Apply UI layer order (top-first ids) as contiguous z-index values. */
export function applyLayerOrder(
  elements: ParchiCanvasElement[],
  topFirstIds: string[]
): ParchiCanvasElement[] {
  const byId = new Map(elements.map((el) => [el.id, el]));
  if (topFirstIds.length !== elements.length) return elements;

  const n = topFirstIds.length;
  return topFirstIds.map((id, index) => ({
    ...byId.get(id)!,
    zIndex: n - 1 - index,
  }));
}

export function reorderLayerIds(
  topFirstIds: string[],
  draggedId: string,
  dropTargetId: string
): string[] {
  if (draggedId === dropTargetId) return topFirstIds;
  const from = topFirstIds.indexOf(draggedId);
  const to = topFirstIds.indexOf(dropTargetId);
  if (from < 0 || to < 0) return topFirstIds;

  const next = [...topFirstIds];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
