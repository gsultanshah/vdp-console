import PDFDocument from 'pdfkit';
import path from 'path';
import { existsSync } from 'fs';
import type { ParchiSlotConfig, ParchiVoterRecord, ResolvedParchiSlot, VoterParchiDesign } from '@/lib/voter-parchi/types';
import { fetchImageBuffer, resolveAssetUrl, resolveFieldValue } from '@/lib/voter-parchi/voter-data';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 18;
const GAP = 8;

function resolveFont(): string {
  const candidates = [
    path.join(process.cwd(), 'assets/fonts/NotoSansArabic-Regular.ttf'),
    path.join(process.cwd(), 'assets/fonts/NotoSans-Regular.ttf'),
    '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
    '/Library/Fonts/Arial Unicode.ttf',
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return 'Helvetica';
}

function slotLabel(slot: ParchiSlotConfig): string {
  if (slot.labelUrdu) return `${slot.labelUrdu}:`;
  if (slot.label) return `${slot.label}:`;
  return '';
}

async function resolveSlotsForVoter(
  voter: ParchiVoterRecord,
  design: VoterParchiDesign
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

    const imageBuffer = imageUrl ? await fetchImageBuffer(imageUrl) : null;

    slots.push({
      slotId: slot.slotId,
      label: slot.label,
      labelUrdu: slot.labelUrdu,
      showLabel: slot.showLabel,
      text,
      imageUrl,
      imageBuffer,
    });
  }

  return slots;
}

function drawBorder(doc: InstanceType<typeof PDFDocument>, x: number, y: number, w: number, h: number) {
  doc.rect(x, y, w, h).stroke('#111');
}

function drawLabeledText(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
  w: number,
  h: number,
  slot: ResolvedParchiSlot,
  fontSize: number
) {
  const padding = 4;
  const label = slot.showLabel ? slotLabel({ ...slot, fieldId: 'customText', enabled: true, slotId: slot.slotId }) : '';
  doc.fontSize(fontSize);

  if (label) {
    doc.font('Helvetica-Bold').text(label, x + padding, y + padding, { width: w - padding * 2, align: 'right' });
    const labelHeight = doc.heightOfString(label, { width: w - padding * 2 });
    doc.font('Helvetica').text(slot.text || '—', x + padding, y + padding + labelHeight + 2, {
      width: w - padding * 2,
      align: 'right',
      lineGap: 1,
    });
  } else {
    doc.text(slot.text || '—', x + padding, y + padding, {
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
  useCustomFont: boolean
) {
  const slotMap = new Map(slots.map((s) => [s.slotId, s]));
  const header = slotMap.get('headerRow');
  const leftVisual = slotMap.get('leftVisual');
  const topRight = slotMap.get('topRight');
  const topLeft = slotMap.get('topLeft');
  const middle = slotMap.get('middleRow');
  const bottom = slotMap.get('bottomRow');

  const headerH = header ? 42 : 0;
  const bodyY = y + headerH;
  const bodyH = h - headerH;

  drawBorder(doc, x, y, w, h);

  if (header) {
    drawBorder(doc, x, y, w, headerH);
    if (header.imageBuffer) {
      try {
        doc.image(header.imageBuffer, x + 1, y + 1, { fit: [w - 2, headerH - 2], align: 'center', valign: 'center' });
      } catch {
        doc.fontSize(8).fillColor('#666').text('Row scan unavailable', x + 4, y + 14, { width: w - 8, align: 'center' });
      }
    } else if (header.text) {
      if (useCustomFont) doc.font(resolveFont());
      drawLabeledText(doc, x, y, w, headerH, header, 8);
      if (useCustomFont) doc.font(resolveFont());
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
        doc.fontSize(8).fillColor('#666').text('Symbol', x + 4, bodyY + bodyH / 2 - 4, { width: leftW - 8, align: 'center' });
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
      if (useCustomFont) doc.font(resolveFont());
      drawLabeledText(doc, rightX, bodyY, halfW, row1H, topRight, 9);
    }
    if (topLeft) {
      drawBorder(doc, rightX + halfW, bodyY, halfW, row1H);
      if (useCustomFont) doc.font(resolveFont());
      drawLabeledText(doc, rightX + halfW, bodyY, halfW, row1H, topLeft, 9);
    }
  }

  if (middle) {
    drawBorder(doc, rightX, bodyY + row1H, rightW, row2H);
    if (useCustomFont) doc.font(resolveFont());
    drawLabeledText(doc, rightX, bodyY + row1H, rightW, row2H, middle, 9);
  }

  if (bottom) {
    drawBorder(doc, rightX, bodyY + row1H + row2H, rightW, row3H);
    if (useCustomFont) doc.font(resolveFont());
    drawLabeledText(doc, rightX, bodyY + row1H + row2H, rightW, row3H, bottom, 9);
  }

  doc.fillColor('#000');
}

export async function buildParchiPdfBuffer(
  halkaName: string,
  design: VoterParchiDesign,
  voters: ParchiVoterRecord[]
): Promise<Buffer> {
  const fontPath = resolveFont();
  const useCustomFont = fontPath !== 'Helvetica';
  const parchiPerPage = Math.max(1, Math.min(5, design.parchiPerPage || 3));
  const contentW = PAGE_WIDTH - MARGIN * 2;
  const contentH = PAGE_HEIGHT - MARGIN * 2;
  const parchiH = (contentH - GAP * (parchiPerPage - 1)) / parchiPerPage;

  const resolved = await Promise.all(
    voters.map(async (voter) => ({
      voter,
      slots: await resolveSlotsForVoter(voter, design),
    }))
  );

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    if (useCustomFont) {
      doc.registerFont('Urdu', fontPath);
      doc.font('Urdu');
    }

    let index = 0;
    while (index < resolved.length) {
      if (index > 0) doc.addPage();

      for (let slot = 0; slot < parchiPerPage && index < resolved.length; slot += 1, index += 1) {
        const y = MARGIN + slot * (parchiH + GAP);
        drawParchi(doc, MARGIN, y, contentW, parchiH, resolved[index].slots, useCustomFont);
      }
    }

    if (resolved.length === 0) {
      doc.fontSize(14).text(`No voters for ${halkaName}`, MARGIN, MARGIN);
    }

    doc.end();
  });
}

export function countPdfPages(voterCount: number, parchiPerPage: number): number {
  if (voterCount <= 0) return 0;
  return Math.ceil(voterCount / Math.max(1, parchiPerPage));
}
