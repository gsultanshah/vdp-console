import type { ParchiCanvasElement } from '@/lib/voter-parchi/types';

export type ElementAlignMode = 'left' | 'center' | 'right';

export function alignCanvasElements(
  elements: ParchiCanvasElement[],
  selectedIds: string[],
  mode: ElementAlignMode
): ParchiCanvasElement[] {
  if (selectedIds.length < 2) return elements;

  const selected = elements.filter((el) => selectedIds.includes(el.id));
  if (selected.length < 2) return elements;

  const left = Math.min(...selected.map((el) => el.x));
  const right = Math.max(...selected.map((el) => el.x + el.w));
  const center = (left + right) / 2;

  return elements.map((el) => {
    if (!selectedIds.includes(el.id)) return el;
    if (mode === 'left') {
      return { ...el, x: left };
    }
    if (mode === 'right') {
      return { ...el, x: Math.max(0, right - el.w) };
    }
    return { ...el, x: Math.max(0, Math.min(100 - el.w, center - el.w / 2)) };
  });
}
