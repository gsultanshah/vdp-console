import PDFDocument from 'pdfkit';
import type { ParchiSlotConfig, ParchiVoterRecord, ResolvedParchiSlot, VoterParchiDesign } from '@/lib/voter-parchi/types';
import { drawCanvasParchi } from '@/lib/voter-parchi/canvas-pdf';
import {
  fitSlipInCell,
  getSlipCellDimensions,
  getSlipPosition,
  slipSizeInPoints,
} from '@/lib/voter-parchi/canvas-layout';
import {
  fetchImageBuffer,
  fetchRowCropImageBuffer,
  preparePdfDisplayText,
  resolveAssetUrl,
  resolveFieldValue,
  cleanPdfUrduText,
  sortParchiVotersBySilsila,
} from '@/lib/voter-parchi/voter-data';
import { resolveCanvasAssetUrl } from '@/lib/voter-parchi/canvas-utils';
import { CLOUDINARY_CROP_WIDTH } from '@/lib/cloudinary-url';
import { pickPdfFont, pickPdfLayoutFont, pdfFontFallback, type RegisteredParchiFonts } from '@/lib/voter-parchi/parchi-fonts';
import { registerParchiPdfFonts } from '@/lib/voter-parchi/parchi-fonts-server';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 18;
const GAP = 8;
const IMAGE_FETCH_CONCURRENCY = 6;

function measureHeaderHeight(
  header: ResolvedParchiSlot | undefined,
  w: number,
  fallbackH: number
): number {
  if (!header) return 0;
  const cropHeight = header.cropHeight ?? 0;
  if (cropHeight > 0) {
    return Math.min(110, Math.max(40, ((w - 2) * cropHeight) / CLOUDINARY_CROP_WIDTH + 2));
  }
  if (header.imageBuffer || header.imageUrl) {
    return Math.min(96, Math.max(52, fallbackH * 0.3));
  }
  return Math.min(96, Math.max(52, fallbackH * 0.3));
}

function slotLabel(slot: ParchiSlotConfig): string {
  if (slot.labelUrdu) return slot.labelUrdu.replace(/:+$/, '').trimEnd();
  if (slot.label) return slot.label.replace(/:+$/, '').trimEnd();
  return '';
}

async function mapLimit<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length) as R[];
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, async () => {
    while (true) {
      const current = index;
      index += 1;
      if (current >= items.length) return;
      results[current] = await fn(items[current]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function resolveSlotsForVoter(
  voter: ParchiVoterRecord,
  design: VoterParchiDesign,
  assetCache: Map<string, Buffer | null>
): Promise<ResolvedParchiSlot[]> {
  const slots: ResolvedParchiSlot[] = [];

  for (const slot of design.slots) {
    if (!slot.enabled) continue;

    const text = resolveFieldValue(slot.fieldId, voter, design);
    let imageUrl: string | null = null;

    if (slot.fieldId === 'rowCrop') {
      imageUrl = voter.rowCropUrl;
    } else if (slot.fieldId === 'symbol' || slot.fieldId === 'photo') {
      imageUrl = resolveAssetUrl(design, slot.fieldId);
    }

    let imageBuffer: Buffer | null = null;
    if (slot.fieldId === 'rowCrop') {
      if (assetCache.has(`rowcrop:${voter._id}`)) {
        imageBuffer = assetCache.get(`rowcrop:${voter._id}`) ?? null;
      } else {
        imageBuffer = await fetchRowCropImageBuffer(voter);
        assetCache.set(`rowcrop:${voter._id}`, imageBuffer);
      }
    } else if (imageUrl) {
      if (assetCache.has(imageUrl)) {
        imageBuffer = assetCache.get(imageUrl) ?? null;
      } else {
        imageBuffer = await fetchImageBuffer(imageUrl);
        assetCache.set(imageUrl, imageBuffer);
      }
    }

    slots.push({
      slotId: slot.slotId,
      label: slot.label,
      labelUrdu: slot.labelUrdu,
      showLabel: slot.showLabel,
      text,
      imageUrl,
      imageBuffer,
      cropHeight: slot.fieldId === 'rowCrop' ? voter.rowCropHeight : undefined,
    });
  }

  return slots;
}

function drawBorder(doc: InstanceType<typeof PDFDocument>, x: number, y: number, w: number, h: number) {
  doc.rect(x, y, w, h).stroke('#111');
}

function safePdfText(
  doc: InstanceType<typeof PDFDocument>,
  text: string,
  renderFont: string,
  layoutFont: string,
  fonts: RegisteredParchiFonts,
  x: number,
  y: number,
  options: { width: number; align?: 'left' | 'center' | 'right'; lineGap?: number }
) {
  try {
    doc.font(renderFont).text(text, x, y, options);
  } catch {
    doc.font(layoutFont).text(text, x, y, options);
  }
}

function safePdfTextHeight(
  doc: InstanceType<typeof PDFDocument>,
  text: string,
  layoutFont: string,
  fonts: RegisteredParchiFonts,
  width: number
): number {
  try {
    doc.font(layoutFont);
    return doc.heightOfString(text, { width });
  } catch {
    doc.font(pdfFontFallback(fonts));
    return doc.heightOfString(text, { width });
  }
}

function drawLabeledText(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
  w: number,
  h: number,
  slot: ResolvedParchiSlot,
  fontSize: number,
  fonts: RegisteredParchiFonts
) {
  const padding = 4;
  const label = slot.showLabel
    ? preparePdfDisplayText(slotLabel({ ...slot, fieldId: 'customText', enabled: true, slotId: slot.slotId }))
    : '';
  const displayText = preparePdfDisplayText(cleanPdfUrduText(slot.text) || '—');
  let valueFontSize = fontSize;
  if (slot.slotId === 'bottomRow' && displayText.length > 50) {
    valueFontSize = Math.max(7, fontSize - 1);
  }
  const labelRenderFont = pickPdfFont(label, undefined, fonts);
  const labelLayoutFont = pickPdfLayoutFont(label, undefined, fonts);
  const valueRenderFont = pickPdfFont(displayText, undefined, fonts);
  const valueLayoutFont = pickPdfLayoutFont(displayText, undefined, fonts);
  doc.fontSize(fontSize);

  if (label) {
    safePdfText(doc, label, labelRenderFont, labelLayoutFont, fonts, x + padding, y + padding, {
      width: w - padding * 2,
      align: 'right',
    });
    const labelHeight = safePdfTextHeight(doc, label, labelLayoutFont, fonts, w - padding * 2);
    doc.fontSize(valueFontSize);
    safePdfText(
      doc,
      displayText,
      valueRenderFont,
      valueLayoutFont,
      fonts,
      x + padding,
      y + padding + labelHeight + 2,
      {
        width: w - padding * 2,
        align: 'right',
        lineGap: 1,
      }
    );
  } else {
    doc.fontSize(valueFontSize);
    safePdfText(doc, displayText, valueRenderFont, valueLayoutFont, fonts, x + padding, y + padding, {
      width: w - padding * 2,
      align: 'right',
      lineGap: 1,
    });
  }
}

function drawParchi(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
  w: number,
  h: number,
  slots: ResolvedParchiSlot[],
  fonts: RegisteredParchiFonts
) {
  const slotMap = new Map(slots.map((s) => [s.slotId, s]));
  const header = slotMap.get('headerRow');
  const leftVisual = slotMap.get('leftVisual');
  const topRight = slotMap.get('topRight');
  const topLeft = slotMap.get('topLeft');
  const middle = slotMap.get('middleRow');
  const bottom = slotMap.get('bottomRow');

  const headerH = measureHeaderHeight(header, w, h);
  const bodyY = y + headerH;
  const bodyH = h - headerH;

  drawBorder(doc, x, y, w, h);

  if (header) {
    drawBorder(doc, x, y, w, headerH);
    if (header.imageBuffer) {
      try {
        doc.save();
        doc.rect(x + 1, y + 1, w - 2, headerH - 2).clip();
        doc.image(header.imageBuffer, x + 1, y + 1, {
          cover: [w - 2, headerH - 2],
          valign: 'center',
        });
        doc.restore();
      } catch {
        doc.fontSize(8).fillColor('#666').text('Row scan unavailable', x + 4, y + 14, {
          width: w - 8,
          align: 'center',
        });
      }
    } else if (header.imageUrl) {
      doc.fontSize(8).fillColor('#666').text('Row scan unavailable', x + 4, y + 14, {
        width: w - 8,
        align: 'center',
      });
    } else if (header.text) {
      drawLabeledText(doc, x, y, w, headerH, header, 8, fonts);
    }
  }

  const leftW = leftVisual ? Math.min(90, w * 0.22) : 0;
  const rightX = x + leftW;
  const rightW = w - leftW;

  if (leftVisual) {
    drawBorder(doc, x, bodyY, leftW, bodyH);
    if (leftVisual.imageBuffer) {
      try {
        doc.image(leftVisual.imageBuffer, x + 4, bodyY + 4, {
          fit: [leftW - 8, bodyH - 8],
          align: 'center',
          valign: 'center',
        });
      } catch {
        doc.fontSize(8).fillColor('#666').text('Symbol', x + 4, bodyY + bodyH / 2 - 4, {
          width: leftW - 8,
          align: 'center',
        });
      }
    }
  }

  const row1H = bodyH * 0.28;
  const row2H = bodyH * 0.36;
  const row3H = bodyH - row1H - row2H;

  if (topRight || topLeft) {
    const halfW = rightW / 2;
    if (topRight) {
      drawBorder(doc, rightX, bodyY, halfW, row1H);
      drawLabeledText(doc, rightX, bodyY, halfW, row1H, topRight, 9, fonts);
    }
    if (topLeft) {
      drawBorder(doc, rightX + halfW, bodyY, halfW, row1H);
      drawLabeledText(doc, rightX + halfW, bodyY, halfW, row1H, topLeft, 9, fonts);
    }
  }

  if (middle) {
    drawBorder(doc, rightX, bodyY + row1H, rightW, row2H);
    drawLabeledText(doc, rightX, bodyY + row1H, rightW, row2H, middle, 9, fonts);
  }

  if (bottom) {
    drawBorder(doc, rightX, bodyY + row1H + row2H, rightW, row3H);
    drawLabeledText(doc, rightX, bodyY + row1H + row2H, rightW, row3H, bottom, 9, fonts);
  }

  doc.fillColor('#000');
}

export async function buildParchiPdfBuffer(
  halkaName: string,
  design: VoterParchiDesign,
  voters: ParchiVoterRecord[]
): Promise<Buffer> {
  const orderedVoters = sortParchiVotersBySilsila(voters);
  const parchiPerPage = Math.max(1, Math.min(5, design.parchiPerPage || 3));
  const contentW = PAGE_WIDTH - MARGIN * 2;
  const contentH = PAGE_HEIGHT - MARGIN * 2;
  const { cellW, cellH, cols } = getSlipCellDimensions(contentW, contentH, GAP, parchiPerPage);
  const useCanvas = design.layoutMode === 'canvas' && design.canvas;

  const assetCache = new Map<string, Buffer | null>();
  // Prefetch shared design assets once.
  for (const fieldId of ['symbol', 'photo'] as const) {
    const url = resolveAssetUrl(design, fieldId);
    if (url && !assetCache.has(url)) {
      assetCache.set(url, await fetchImageBuffer(url));
    }
  }
  if (useCanvas && design.canvas?.backgroundAssetId) {
    const bgUrl = resolveCanvasAssetUrl(design, design.canvas.backgroundAssetId);
    if (bgUrl && !assetCache.has(bgUrl)) {
      assetCache.set(bgUrl, await fetchImageBuffer(bgUrl));
    }
  }

  const resolved = useCanvas
    ? orderedVoters.map((voter) => ({ voter, slots: [] as ResolvedParchiSlot[] }))
    : await mapLimit(orderedVoters, IMAGE_FETCH_CONCURRENCY, async (voter) => ({
        voter,
        slots: await resolveSlotsForVoter(voter, design, assetCache),
      }));

  const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  const fonts = registerParchiPdfFonts(doc);
  doc.font(fonts.nastaliq ?? fonts.arabic ?? fonts.latin ?? fonts.fallback);

  let index = 0;
  while (index < resolved.length) {
    if (index > 0) doc.addPage();

    for (let slot = 0; slot < parchiPerPage && index < resolved.length; slot += 1, index += 1) {
      const { x, y } = getSlipPosition(slot, MARGIN, cellW, cellH, GAP, cols);
      if (useCanvas && design.canvas) {
        const slipPt = slipSizeInPoints(design.canvas);
        const fitted = fitSlipInCell(cellW, cellH, slipPt.w, slipPt.h);
        const renderScale = slipPt.w > 0 ? fitted.w / slipPt.w : 1;
        await drawCanvasParchi(
          doc,
          x + fitted.offsetX,
          y + fitted.offsetY,
          fitted.w,
          fitted.h,
          design,
          resolved[index].voter,
          fonts,
          assetCache,
          renderScale
        );
      } else {
        drawParchi(doc, x, y, cellW, cellH, resolved[index].slots, fonts);
      }
    }
  }

  if (resolved.length === 0) {
    doc.fontSize(14).text(`No voters for ${halkaName}`, MARGIN, MARGIN);
  }

  return new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

export function countPdfPages(voterCount: number, parchiPerPage: number): number {
  if (voterCount <= 0) return 0;
  return Math.ceil(voterCount / Math.max(1, parchiPerPage));
}
