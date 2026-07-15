/** Grid placement for parchi on an A4 page. */
export function getParchiPageGrid(parchiPerPage: number): { cols: number; rows: number } {
  const count = Math.max(1, Math.min(5, parchiPerPage));
  if (count === 4) return { cols: 2, rows: 2 };
  if (count === 2) return { cols: 1, rows: 2 };
  return { cols: 1, rows: count };
}

export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;
export const MM_TO_PT = 72 / 25.4;

/** Default campaign slip — landscape two-panel layout. */
export const DEFAULT_SLIP_WIDTH_MM = 148;
export const DEFAULT_SLIP_HEIGHT_MM = 74;

export function resolveSlipSizeMm(canvas: {
  slipWidthMm?: number;
  slipHeightMm?: number;
  slipAspectRatio?: number;
} | null | undefined): { widthMm: number; heightMm: number; aspect: number } {
  const widthMm = canvas?.slipWidthMm;
  const heightMm = canvas?.slipHeightMm;
  if (widthMm && widthMm > 0 && heightMm && heightMm > 0) {
    return { widthMm, heightMm, aspect: widthMm / heightMm };
  }
  const aspect = canvas?.slipAspectRatio ?? DEFAULT_SLIP_WIDTH_MM / DEFAULT_SLIP_HEIGHT_MM;
  const h = heightMm && heightMm > 0 ? heightMm : DEFAULT_SLIP_HEIGHT_MM;
  const w = widthMm && widthMm > 0 ? widthMm : h * aspect;
  return { widthMm: w, heightMm: h, aspect: w / h };
}

export function slipSizeInPoints(canvas: {
  slipWidthMm?: number;
  slipHeightMm?: number;
  slipAspectRatio?: number;
} | null | undefined): { w: number; h: number } {
  const { widthMm, heightMm } = resolveSlipSizeMm(canvas);
  return { w: widthMm * MM_TO_PT, h: heightMm * MM_TO_PT };
}

/** Scale slip to fit inside a grid cell while preserving mm proportions. */
export function fitSlipInCell(
  cellW: number,
  cellH: number,
  slipW: number,
  slipH: number
): { offsetX: number; offsetY: number; w: number; h: number } {
  if (slipW <= 0 || slipH <= 0) {
    return { offsetX: 0, offsetY: 0, w: cellW, h: cellH };
  }
  const scale = Math.min(cellW / slipW, cellH / slipH);
  const w = slipW * scale;
  const h = slipH * scale;
  return { offsetX: (cellW - w) / 2, offsetY: (cellH - h) / 2, w, h };
}

export function getSlipCellDimensions(
  contentW: number,
  contentH: number,
  gap: number,
  parchiPerPage: number
): { cellW: number; cellH: number; cols: number; rows: number } {
  const { cols, rows } = getParchiPageGrid(parchiPerPage);
  const cellW = (contentW - gap * (cols - 1)) / cols;
  const cellH = (contentH - gap * (rows - 1)) / rows;
  return { cellW, cellH, cols, rows };
}

export function getSlipPosition(
  indexOnPage: number,
  margin: number,
  cellW: number,
  cellH: number,
  gap: number,
  cols: number
): { x: number; y: number } {
  const col = indexOnPage % cols;
  const row = Math.floor(indexOnPage / cols);
  return {
    x: margin + col * (cellW + gap),
    y: margin + row * (cellH + gap),
  };
}

/** A4 preview / print grid cell size in millimetres. */
export function getA4CellSizeMm(
  parchiPerPage: number,
  options?: { marginMm?: number; gapMm?: number }
): { cellWidthMm: number; cellHeightMm: number; cols: number; rows: number } {
  const marginMm = options?.marginMm ?? 8;
  const gapMm = options?.gapMm ?? 2;
  const { cols, rows } = getParchiPageGrid(parchiPerPage);
  const contentW = A4_WIDTH_MM - marginMm * 2;
  const contentH = A4_HEIGHT_MM - marginMm * 2;
  const cellWidthMm = (contentW - gapMm * Math.max(0, cols - 1)) / cols;
  const cellHeightMm = (contentH - gapMm * Math.max(0, rows - 1)) / rows;
  return { cellWidthMm, cellHeightMm, cols, rows };
}

export const A4_PREVIEW_MARGIN_MM = 8;
export const A4_PREVIEW_GAP_MM = 2;

export function clampSlipSizeMm(widthMm: number, heightMm: number): { widthMm: number; heightMm: number } {
  return {
    widthMm: Math.max(20, Math.min(A4_WIDTH_MM, widthMm)),
    heightMm: Math.max(20, Math.min(A4_HEIGHT_MM, heightMm)),
  };
}
