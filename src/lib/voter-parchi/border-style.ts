import type { ParchiBorderStyle } from '@/lib/voter-parchi/types';

export const PARCHI_BORDER_STYLE_OPTIONS: { id: ParchiBorderStyle; label: string }[] = [
  { id: 'solid', label: 'Solid' },
  { id: 'dashed', label: 'Dashed' },
  { id: 'dotted', label: 'Dotted' },
];

export function cssBorderLineStyle(style?: ParchiBorderStyle): string {
  return style ?? 'solid';
}

export function applyPdfStrokeDash(
  doc: { undash: () => void; dash: (length: number, options?: { space?: number }) => void },
  borderStyle: ParchiBorderStyle | undefined,
  lineWidth: number
) {
  doc.undash();
  const w = Math.max(0.5, lineWidth);
  if (borderStyle === 'dashed') {
    doc.dash(w * 4, { space: w * 2.5 });
  } else if (borderStyle === 'dotted') {
    doc.dash(w, { space: w * 1.5 });
  }
}

export function strokePdfBorder(
  doc: {
    lineWidth: (w: number) => unknown;
    stroke: (color?: string) => unknown;
    undash: () => void;
    dash: (length: number, options?: { space?: number }) => void;
  },
  color: string,
  borderStyle: ParchiBorderStyle | undefined,
  lineWidth: number
) {
  const w = Math.max(0.5, lineWidth);
  doc.lineWidth(w);
  applyPdfStrokeDash(doc, borderStyle, w);
  doc.stroke(color);
  doc.undash();
}
