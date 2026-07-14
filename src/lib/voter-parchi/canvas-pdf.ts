import PDFDocument from 'pdfkit';
import type {
  ParchiCanvasElement,
  ParchiCanvasElementStyle,
  ParchiVoterRecord,
  VoterParchiDesign,
} from '@/lib/voter-parchi/types';
import { fieldLabel, resolveCanvasAssetUrl, sortCanvasElements } from '@/lib/voter-parchi/canvas-utils';
import {
  displayPdfFieldText,
  fetchImageBuffer,
  resolveAssetUrl,
  resolveFieldValue,
} from '@/lib/voter-parchi/voter-data';

type ParchiFonts = {
  arabic: string | null;
  latin: string | null;
  fallback: string;
};

function textPrefersLatin(text: string): boolean {
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  const arabic =
    (text.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g) ?? []).length;
  return latin > 0 && latin >= arabic;
}

function pickFontForText(text: string, fonts: ParchiFonts): string {
  const trimmed = text.trim();
  if (/^[\d\s\-+().,/:%#]+$/.test(trimmed)) {
    return fonts.latin ?? fonts.arabic ?? fonts.fallback;
  }
  if (textPrefersLatin(text)) {
    return fonts.latin ?? fonts.arabic ?? fonts.fallback;
  }
  return fonts.arabic ?? fonts.latin ?? fonts.fallback;
}

function elementBox(x: number, y: number, w: number, h: number, el: ParchiCanvasElement) {
  const px = x + (el.x / 100) * w;
  const py = y + (el.y / 100) * h;
  const pw = (el.w / 100) * w;
  const ph = (el.h / 100) * h;
  return { px, py, pw, ph };
}

function scaledStyle(style: ParchiCanvasElementStyle | undefined, scale: number): ParchiCanvasElementStyle {
  const s = style ?? {};
  return {
    ...s,
    fontSize: (s.fontSize ?? 9) * scale,
    padding: (s.padding ?? 4) * scale,
    borderWidth: s.borderWidth !== undefined ? s.borderWidth * scale : s.borderWidth,
    borderRadius: s.borderRadius !== undefined ? s.borderRadius * scale : s.borderRadius,
  };
}

function drawRoundedRect(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  fill?: string
) {
  const r = Math.min(radius, w / 2, h / 2);
  if (fill) doc.save().fillColor(fill);
  doc.moveTo(x + r, y);
  doc.lineTo(x + w - r, y);
  doc.quadraticCurveTo(x + w, y, x + w, y + r);
  doc.lineTo(x + w, y + h - r);
  doc.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  doc.lineTo(x + r, y + h);
  doc.quadraticCurveTo(x, y + h, x, y + h - r);
  doc.lineTo(x, y + r);
  doc.quadraticCurveTo(x, y, x + r, y);
  if (fill) doc.fill().restore();
  else doc.stroke();
}

async function resolveElementImageUrl(
  design: VoterParchiDesign,
  voter: ParchiVoterRecord,
  el: ParchiCanvasElement
): Promise<string | null> {
  if (el.assetId) {
    return resolveCanvasAssetUrl(design, el.assetId);
  }
  const fieldId = el.imageFieldId;
  if (!fieldId) return null;
  if (fieldId === 'rowCrop') return voter.rowCropUrl;
  if (fieldId === 'symbol' || fieldId === 'photo') return resolveAssetUrl(design, fieldId);
  return null;
}

function fitFontSize(
  doc: InstanceType<typeof PDFDocument>,
  text: string,
  font: string,
  maxWidth: number,
  maxHeight: number,
  startSize: number,
  minSize: number
): number {
  if (maxWidth <= 0 || maxHeight <= 0) return minSize;
  for (let size = startSize; size >= minSize; size -= 0.25) {
    doc.font(font).fontSize(size);
    const height = doc.heightOfString(text, { width: maxWidth, lineGap: 0 });
    if (height <= maxHeight + 0.5) return size;
  }
  return minSize;
}

function measureTextWidth(
  doc: InstanceType<typeof PDFDocument>,
  text: string,
  font: string,
  fontSize: number
): number {
  doc.font(font).fontSize(fontSize);
  // Urdu glyphs are often wider than PDFKit's widthOfString reports.
  return doc.widthOfString(text) * 1.2;
}

function drawTextInClip(
  doc: InstanceType<typeof PDFDocument>,
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  options: {
    font: string;
    fontSize: number;
    color: string;
    align: 'left' | 'center' | 'right';
    padX?: number;
    padY?: number;
  }
) {
  const padX = options.padX ?? 0;
  const padY = options.padY ?? 0;
  const clipX = x + padX;
  const clipY = y + padY;
  const clipW = Math.max(1, w - padX * 2);
  const clipH = Math.max(1, h - padY * 2);

  doc.save();
  doc.rect(clipX, clipY, clipW, clipH).clip();
  doc
    .fillColor(options.color)
    .font(options.font)
    .fontSize(options.fontSize)
    .text(text, clipX, clipY, {
      width: clipW,
      height: clipH,
      align: options.align,
      lineGap: 0,
    });
  doc.restore();
}

function drawElementText(
  doc: InstanceType<typeof PDFDocument>,
  px: number,
  py: number,
  pw: number,
  ph: number,
  text: string,
  el: ParchiCanvasElement,
  fonts: ParchiFonts,
  scale: number
) {
  const style = scaledStyle(el.style, scale);
  const padding = style.padding ?? 4 * scale;
  const baseFontSize = Math.max(4, style.fontSize ?? 9 * scale);
  const align = style.textAlign ?? 'right';
  const display = displayPdfFieldText(text);
  const font = pickFontForText(display, fonts);
  const innerW = Math.max(1, pw - padding * 2);
  const innerH = Math.max(1, ph - padding * 2);

  if (style.backgroundColor) {
    const radius = style.borderRadius ?? 0;
    if (radius > 0) drawRoundedRect(doc, px, py, pw, ph, radius, style.backgroundColor);
    else doc.rect(px, py, pw, ph).fill(style.backgroundColor);
  }
  if (style.borderColor && (style.borderWidth ?? 0) > 0) {
    doc.rect(px, py, pw, ph).lineWidth(style.borderWidth ?? 1).stroke(style.borderColor);
  }

  doc.save();
  doc.rect(px, py, pw, ph).clip();

  const fontSize = fitFontSize(doc, display, font, innerW, innerH, baseFontSize, 3.5);
  const edgePad = Math.max(1.5, 1.5 * scale);
  drawTextInClip(doc, display, px + padding, py + padding, innerW, innerH, {
    font,
    fontSize,
    color: style.color ?? '#000000',
    align,
    padX: edgePad,
    padY: 0,
  });

  doc.restore();
}

function drawLabelValue(
  doc: InstanceType<typeof PDFDocument>,
  px: number,
  py: number,
  pw: number,
  ph: number,
  el: ParchiCanvasElement,
  value: string,
  fonts: ParchiFonts,
  scale: number
) {
  const style = scaledStyle(el.style, scale);
  const padding = style.padding ?? 3 * scale;
  const baseFontSize = Math.max(4, style.fontSize ?? 8 * scale);
  const align = style.textAlign ?? 'right';
  const label = el.showLabel !== false ? fieldLabel(el.fieldId ?? '', el.label, el.labelUrdu) : '';
  const display = displayPdfFieldText(value);
  const innerX = px + padding;
  const innerY = py + padding;
  const innerW = Math.max(1, pw - padding * 2);
  const innerH = Math.max(1, ph - padding * 2);

  if (style.backgroundColor) {
    doc.rect(px, py, pw, ph).fill(style.backgroundColor);
  }
  if (style.borderColor && (style.borderWidth ?? 0) > 0) {
    doc.rect(px, py, pw, ph).lineWidth(style.borderWidth ?? 1).stroke(style.borderColor);
  }

  doc.save();
  doc.rect(px, py, pw, ph).clip();

  if (!label) {
    const valueFont = pickFontForText(display, fonts);
    const valueSize = fitFontSize(doc, display, valueFont, innerW, innerH, baseFontSize, 3.5);
    const valueAlign = textPrefersLatin(display) ? 'left' : align;
    drawTextInClip(doc, display, innerX, innerY, innerW, innerH, {
      font: valueFont,
      fontSize: valueSize,
      color: style.color ?? '#111111',
      align: valueAlign,
    });
    doc.restore();
    return;
  }

  const labelFont = pickFontForText(label, fonts);
  let labelSize = Math.max(4.5, baseFontSize * 0.78);
  const gap = Math.max(2, 2 * scale);
  const edgePad = Math.max(1.5, 1.5 * scale);
  const valueFont = pickFontForText(display, fonts);
  const valueAlign = textPrefersLatin(display) ? 'left' : align;

  const labelMeasuredW = measureTextWidth(doc, label, labelFont, labelSize);
  const valueMeasuredW = measureTextWidth(doc, display, valueFont, Math.max(labelSize, baseFontSize * 0.9));
  const minValueW = Math.min(valueMeasuredW + edgePad * 2, innerW * 0.55);
  const fitsSideBySide = innerW >= labelMeasuredW + minValueW + gap + edgePad * 2;

  if (!fitsSideBySide) {
    const labelBlockH = Math.min(innerH * 0.46, Math.max(labelSize * 1.35, innerH * 0.38));
    const valueH = Math.max(4, innerH - labelBlockH - gap);
    labelSize = fitFontSize(doc, label, labelFont, innerW - edgePad * 2, labelBlockH, labelSize, 4);

    drawTextInClip(doc, label, innerX, innerY, innerW, labelBlockH, {
      font: labelFont,
      fontSize: labelSize,
      color: '#00401A',
      align: 'right',
      padX: edgePad,
      padY: 0,
    });

    const valueSize = fitFontSize(doc, display, valueFont, innerW - edgePad * 2, valueH, baseFontSize, 3.5);
    drawTextInClip(doc, display, innerX, innerY + labelBlockH + gap, innerW, valueH, {
      font: valueFont,
      fontSize: valueSize,
      color: style.color ?? '#111111',
      align: valueAlign,
      padX: edgePad,
      padY: 0,
    });

    doc.restore();
    return;
  }

  const labelW = Math.min(innerW - gap - minValueW, labelMeasuredW + edgePad * 2);
  const valueW = Math.max(minValueW, innerW - labelW - gap);
  const labelX = innerX + innerW - labelW;
  const valueSize = fitFontSize(doc, display, valueFont, valueW - edgePad, innerH, baseFontSize, 3.5);

  drawTextInClip(doc, label, labelX, innerY, labelW, innerH, {
    font: labelFont,
    fontSize: labelSize,
    color: '#00401A',
    align: 'right',
    padX: edgePad,
    padY: 0,
  });

  drawTextInClip(doc, display, innerX, innerY, valueW, innerH, {
    font: valueFont,
    fontSize: valueSize,
    color: style.color ?? '#111111',
    align: valueAlign,
    padX: edgePad,
    padY: 0,
  });

  doc.restore();
}

export async function drawCanvasParchi(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
  w: number,
  h: number,
  design: VoterParchiDesign,
  voter: ParchiVoterRecord,
  fonts: ParchiFonts,
  assetCache: Map<string, Buffer | null>,
  renderScale = 1
): Promise<void> {
  const canvas = design.canvas;
  if (!canvas) return;

  const scale = Math.max(0.1, renderScale);

  doc.save();
  doc.rect(x, y, w, h).clip();

  if (canvas.backgroundColor) {
    doc.rect(x, y, w, h).fill(canvas.backgroundColor);
  }

  const bgUrl = resolveCanvasAssetUrl(design, canvas.backgroundAssetId);
  if (bgUrl) {
    let buffer = assetCache.get(bgUrl);
    if (buffer === undefined) {
      buffer = await fetchImageBuffer(bgUrl);
      assetCache.set(bgUrl, buffer);
    }
    if (buffer) {
      try {
        doc.image(buffer, x, y, { width: w, height: h });
      } catch {
        // ignore broken background
      }
    }
  }

  const elements = sortCanvasElements(canvas.elements);

  for (const el of elements) {
    const { px, py, pw, ph } = elementBox(x, y, w, h, el);
    const style = scaledStyle(el.style, scale);

    if (el.type === 'rect' || el.type === 'circle') {
      const radius = el.type === 'circle' ? Math.min(pw, ph) / 2 : (style.borderRadius ?? 0);
      if (el.type === 'circle') {
        const cx = px + pw / 2;
        const cy = py + ph / 2;
        if (style.backgroundColor) {
          doc.ellipse(cx, cy, pw / 2, ph / 2).fill(style.backgroundColor);
        }
        if (style.borderColor && (style.borderWidth ?? 0) > 0) {
          doc.ellipse(cx, cy, pw / 2, ph / 2).lineWidth(style.borderWidth ?? 1).stroke(style.borderColor);
        }
      } else if (style.backgroundColor) {
        if (radius > 0) drawRoundedRect(doc, px, py, pw, ph, radius, style.backgroundColor);
        else doc.rect(px, py, pw, ph).fill(style.backgroundColor);
      }
      if (el.type === 'rect' && style.borderColor && (style.borderWidth ?? 0) > 0) {
        doc.rect(px, py, pw, ph).lineWidth(style.borderWidth ?? 1).stroke(style.borderColor);
      }
      continue;
    }

    if (el.type === 'text') {
      drawElementText(doc, px, py, pw, ph, el.text ?? '', el, fonts, scale);
      continue;
    }

    if (el.type === 'field') {
      const value = el.fieldId ? resolveFieldValue(el.fieldId, voter, design) : '';
      drawElementText(doc, px, py, pw, ph, value, el, fonts, scale);
      continue;
    }

    if (el.type === 'labelValue') {
      const value = el.fieldId ? resolveFieldValue(el.fieldId, voter, design) : '';
      drawLabelValue(doc, px, py, pw, ph, el, value, fonts, scale);
      continue;
    }

    if (el.type === 'image') {
      const inset = 2 * scale;
      if (style.borderColor && (style.borderWidth ?? 0) > 0) {
        doc.rect(px, py, pw, ph).lineWidth(style.borderWidth ?? 1).stroke(style.borderColor);
      }
      const imageUrl = await resolveElementImageUrl(design, voter, el);
      if (!imageUrl) continue;

      let buffer = assetCache.get(imageUrl);
      if (buffer === undefined) {
        buffer = await fetchImageBuffer(imageUrl);
        assetCache.set(imageUrl, buffer);
      }
      if (buffer) {
        try {
          doc.image(buffer, px + inset, py + inset, {
            fit: [Math.max(1, pw - inset * 2), Math.max(1, ph - inset * 2)],
            align: 'center',
            valign: 'center',
          });
        } catch {
          doc
            .fontSize(Math.max(4, 7 * scale))
            .fillColor('#666')
            .text('Image', px + inset * 2, py + ph / 2 - 4 * scale, {
              width: Math.max(1, pw - inset * 4),
              align: 'center',
            });
        }
      }
    }
  }

  doc.restore();
  doc.fillColor('#000');
}
