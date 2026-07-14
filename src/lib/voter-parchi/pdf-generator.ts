import PDFDocument from 'pdfkit';
import path from 'path';
import { existsSync } from 'fs';
import type { ParchiSlotConfig, ParchiVoterRecord, ResolvedParchiSlot, VoterParchiDesign } from '@/lib/voter-parchi/types';
import { fetchImageBuffer, resolveAssetUrl, resolveFieldValue, cleanPdfUrduText } from '@/lib/voter-parchi/voter-data';
import { CLOUDINARY_CROP_WIDTH } from '@/lib/cloudinary-url';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 18;
const GAP = 8;
const IMAGE_FETCH_CONCURRENCY = 6;

type ParchiFonts = {
  arabicPath: string | null;
  latinPath: string | null;
};

function resolveFonts(): ParchiFonts {
  const arabicCandidates = [
    path.join(process.cwd(), 'assets/fonts/NotoSansArabic-Regular.ttf'),
    '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
    '/Library/Fonts/Arial Unicode.ttf',
  ];
  const latinCandidates = [
    path.join(process.cwd(), 'assets/fonts/NotoSans-Regular.ttf'),
    '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
    '/Library/Fonts/Arial Unicode.ttf',
    '/System/Library/Fonts/Supplemental/Arial.ttf',
  ];

  const resolveFirst = (candidates: string[]) => candidates.find((candidate) => existsSync(candidate)) ?? null;

  return {
    arabicPath: resolveFirst(arabicCandidates),
    latinPath: resolveFirst(latinCandidates),
  };
}

function textPrefersLatin(text: string): boolean {
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  const arabic =
    (text.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g) ?? []).length;
  return latin > 0 && latin >= arabic;
}

function pickFontForText(
  text: string,
  arabicFont: string | null,
  latinFont: string | null,
  fallback: string
): string {
  if (textPrefersLatin(text)) {
    return latinFont ?? arabicFont ?? fallback;
  }
  return arabicFont ?? latinFont ?? fallback;
}

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
  if (slot.labelUrdu) return `${slot.labelUrdu}:`;
  if (slot.label) return `${slot.label}:`;
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
    if (imageUrl) {
      if (assetCache.has(imageUrl)) {
        imageBuffer = assetCache.get(imageUrl) ?? null;
      } else if (slot.fieldId === 'symbol' || slot.fieldId === 'photo') {
        imageBuffer = await fetchImageBuffer(imageUrl);
        assetCache.set(imageUrl, imageBuffer);
      } else {
        imageBuffer = await fetchImageBuffer(imageUrl);
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

function drawLabeledText(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
  w: number,
  h: number,
  slot: ResolvedParchiSlot,
  fontSize: number,
  fonts: { arabic: string | null; latin: string | null; fallback: string }
) {
  const padding = 4;
  const label = slot.showLabel
    ? slotLabel({ ...slot, fieldId: 'customText', enabled: true, slotId: slot.slotId })
    : '';
  const displayText = cleanPdfUrduText(slot.text) || '—';
  let valueFontSize = fontSize;
  if (slot.slotId === 'bottomRow' && displayText.length > 50) {
    valueFontSize = Math.max(7, fontSize - 1);
  }
  const labelFont = pickFontForText(label, fonts.arabic, fonts.latin, fonts.fallback);
  const valueFont = pickFontForText(displayText, fonts.arabic, fonts.latin, fonts.fallback);
  doc.fontSize(fontSize);

  if (label) {
    doc.font(labelFont).text(label, x + padding, y + padding, { width: w - padding * 2, align: 'right' });
    const labelHeight = doc.heightOfString(label, { width: w - padding * 2 });
    doc.font(valueFont).fontSize(valueFontSize).text(displayText, x + padding, y + padding + labelHeight + 2, {
      width: w - padding * 2,
      align: 'right',
      lineGap: 1,
    });
  } else {
    doc.font(valueFont).fontSize(valueFontSize).text(displayText, x + padding, y + padding, {
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
  fonts: { arabic: string | null; latin: string | null; fallback: string }
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
        doc.image(header.imageBuffer, x + 1, y + 1, {
          fit: [w - 2, headerH - 2],
          align: 'center',
          valign: 'center',
        });
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
  const resolvedFonts = resolveFonts();
  const fontFallback = 'Helvetica';
  const parchiPerPage = Math.max(1, Math.min(5, design.parchiPerPage || 3));
  const contentW = PAGE_WIDTH - MARGIN * 2;
  const contentH = PAGE_HEIGHT - MARGIN * 2;
  const parchiH = (contentH - GAP * (parchiPerPage - 1)) / parchiPerPage;

  const assetCache = new Map<string, Buffer | null>();
  // Prefetch shared design assets once.
  for (const fieldId of ['symbol', 'photo'] as const) {
    const url = resolveAssetUrl(design, fieldId);
    if (url && !assetCache.has(url)) {
      assetCache.set(url, await fetchImageBuffer(url));
    }
  }

  const resolved = await mapLimit(voters, IMAGE_FETCH_CONCURRENCY, async (voter) => ({
    voter,
    slots: await resolveSlotsForVoter(voter, design, assetCache),
  }));

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    let arabicFont: string | null = null;
    let latinFont: string | null = null;
    if (resolvedFonts.arabicPath) {
      doc.registerFont('ParchiArabic', resolvedFonts.arabicPath);
      arabicFont = 'ParchiArabic';
    }
    if (resolvedFonts.latinPath) {
      // Avoid double-registering the same file under two names when paths coincide.
      if (resolvedFonts.latinPath === resolvedFonts.arabicPath) {
        latinFont = arabicFont;
      } else {
        doc.registerFont('ParchiLatin', resolvedFonts.latinPath);
        latinFont = 'ParchiLatin';
      }
    }

    const fonts = {
      arabic: arabicFont,
      latin: latinFont,
      fallback: fontFallback,
    };
    doc.font(arabicFont ?? latinFont ?? fontFallback);

    let index = 0;
    while (index < resolved.length) {
      if (index > 0) doc.addPage();

      for (let slot = 0; slot < parchiPerPage && index < resolved.length; slot += 1, index += 1) {
        const y = MARGIN + slot * (parchiH + GAP);
        drawParchi(doc, MARGIN, y, contentW, parchiH, resolved[index].slots, fonts);
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
