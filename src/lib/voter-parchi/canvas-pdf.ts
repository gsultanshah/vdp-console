import PDFDocument from 'pdfkit';
import type {
  ParchiCanvasElement,
  ParchiCanvasElementStyle,
  ParchiVoterRecord,
  VoterParchiDesign,
} from '@/lib/voter-parchi/types';
import { fieldLabel, resolveCanvasAssetUrl, resolveLabelElementText, sortCanvasElements } from '@/lib/voter-parchi/canvas-utils';
import {
  fetchImageBuffer,
  preparePdfDisplayText,
  resolveAssetUrl,
  resolveFieldValue,
} from '@/lib/voter-parchi/voter-data';
import { strokePdfBorder } from '@/lib/voter-parchi/border-style';
import {
  pdfFontFallback,
  pickPdfFont,
  pickPdfLayoutFont,
  textPrefersLatin,
  type RegisteredParchiFonts,
} from '@/lib/voter-parchi/parchi-fonts';

type ParchiFonts = RegisteredParchiFonts;

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

function applyPdfFont(
  doc: InstanceType<typeof PDFDocument>,
  font: string,
  fonts: ParchiFonts
): string {
  try {
    doc.font(font);
    return font;
  } catch {
    const fallback = pdfFontFallback(fonts);
    doc.font(fallback);
    return fallback;
  }
}

function fitFontSize(
  doc: InstanceType<typeof PDFDocument>,
  text: string,
  font: string,
  maxWidth: number,
  maxHeight: number,
  startSize: number,
  minSize: number,
  fonts: ParchiFonts
): number {
  if (maxWidth <= 0 || maxHeight <= 0) return minSize;
  const layoutFont = applyPdfFont(doc, font, fonts);
  for (let size = startSize; size >= minSize; size -= 0.25) {
    try {
      doc.fontSize(size);
      const height = doc.heightOfString(text, { width: maxWidth, lineGap: 0 });
      if (height <= maxHeight + 0.5) return size;
    } catch {
      applyPdfFont(doc, pdfFontFallback(fonts), fonts);
      doc.fontSize(size);
      const height = doc.heightOfString(text, { width: maxWidth, lineGap: 0 });
      if (height <= maxHeight + 0.5) return size;
    }
  }
  return minSize;
}

function measureTextWidth(
  doc: InstanceType<typeof PDFDocument>,
  text: string,
  font: string,
  fontSize: number,
  fonts: ParchiFonts
): number {
  try {
    applyPdfFont(doc, font, fonts);
    doc.fontSize(fontSize);
    return doc.widthOfString(text) * 1.2;
  } catch {
    applyPdfFont(doc, pdfFontFallback(fonts), fonts);
    doc.fontSize(fontSize);
    return doc.widthOfString(text) * 1.2;
  }
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
    layoutFont: string;
    fontSize: number;
    color: string;
    align: 'left' | 'center' | 'right';
    padX?: number;
    padY?: number;
  },
  fonts: ParchiFonts
) {
  const padX = options.padX ?? 0;
  const padY = options.padY ?? 0;
  const clipX = x + padX;
  const clipY = y + padY;
  const clipW = Math.max(1, w - padX * 2);
  const clipH = Math.max(1, h - padY * 2);

  doc.save();
  doc.rect(clipX, clipY, clipW, clipH).clip();
  doc.fillColor(options.color).fontSize(options.fontSize);

  const textOptions = {
    width: clipW,
    height: clipH,
    align: options.align,
    lineGap: 0,
  };

  try {
    applyPdfFont(doc, options.font, fonts);
    doc.text(text, clipX, clipY, textOptions);
  } catch {
    applyPdfFont(doc, options.layoutFont, fonts);
    doc.text(text, clipX, clipY, textOptions);
  }

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
  const display = preparePdfDisplayText(text);
  const renderFont = pickPdfFont(display, el.style?.fontFamily, fonts);
  const layoutFont = pickPdfLayoutFont(display, el.style?.fontFamily, fonts);
  const innerW = Math.max(1, pw - padding * 2);
  const innerH = Math.max(1, ph - padding * 2);
  const align =
    el.type === 'field' && textPrefersLatin(display)
      ? 'left'
      : el.type === 'label'
        ? (style.textAlign ?? 'right')
        : (style.textAlign ?? 'right');

  if (style.backgroundColor) {
    const radius = style.borderRadius ?? 0;
    if (radius > 0) drawRoundedRect(doc, px, py, pw, ph, radius, style.backgroundColor);
    else doc.rect(px, py, pw, ph).fill(style.backgroundColor);
  }
  if (style.borderColor && (style.borderWidth ?? 0) > 0) {
    doc.rect(px, py, pw, ph);
    strokePdfBorder(doc, style.borderColor, style.borderStyle, style.borderWidth ?? 1);
  }

  doc.save();
  doc.rect(px, py, pw, ph).clip();

  const fontSize = fitFontSize(doc, display, layoutFont, innerW, innerH, baseFontSize, 3.5, fonts);
  const edgePad = Math.max(1.5, 1.5 * scale);
  drawTextInClip(doc, display, px + padding, py + padding, innerW, innerH, {
    font: renderFont,
    layoutFont,
    fontSize,
    color: style.color ?? '#000000',
    align,
    padX: edgePad,
    padY: 0,
  }, fonts);

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
  const label = el.showLabel !== false ? preparePdfDisplayText(fieldLabel(el.fieldId ?? '', el.label, el.labelUrdu)) : '';
  const display = preparePdfDisplayText(value);
  const innerX = px + padding;
  const innerY = py + padding;
  const innerW = Math.max(1, pw - padding * 2);
  const innerH = Math.max(1, ph - padding * 2);

  if (style.backgroundColor) {
    doc.rect(px, py, pw, ph).fill(style.backgroundColor);
  }
  if (style.borderColor && (style.borderWidth ?? 0) > 0) {
    doc.rect(px, py, pw, ph);
    strokePdfBorder(doc, style.borderColor, style.borderStyle, style.borderWidth ?? 1);
  }

  doc.save();
  doc.rect(px, py, pw, ph).clip();

  if (!label) {
    const renderValueFont = pickPdfFont(display, el.style?.fontFamily, fonts);
    const layoutValueFont = pickPdfLayoutFont(display, el.style?.fontFamily, fonts);
    const valueSize = fitFontSize(doc, display, layoutValueFont, innerW, innerH, baseFontSize, 3.5, fonts);
    const valueAlign = textPrefersLatin(display) ? 'left' : align;
    drawTextInClip(doc, display, innerX, innerY, innerW, innerH, {
      font: renderValueFont,
      layoutFont: layoutValueFont,
      fontSize: valueSize,
      color: style.color ?? '#111111',
      align: valueAlign,
    }, fonts);
    doc.restore();
    return;
  }

  const renderLabelFont = pickPdfFont(label, el.style?.fontFamily, fonts);
  const layoutLabelFont = pickPdfLayoutFont(label, el.style?.fontFamily, fonts);
  let labelSize = Math.max(4.5, baseFontSize * 0.78);
  const gap = Math.max(2, 2 * scale);
  const edgePad = Math.max(1.5, 1.5 * scale);
  const renderValueFont = pickPdfFont(display, el.style?.fontFamily, fonts);
  const layoutValueFont = pickPdfLayoutFont(display, el.style?.fontFamily, fonts);
  const valueAlign = textPrefersLatin(display) ? 'left' : align;

  const labelMeasuredW = measureTextWidth(doc, label, layoutLabelFont, labelSize, fonts);
  const valueMeasuredW = measureTextWidth(
    doc,
    display,
    layoutValueFont,
    Math.max(labelSize, baseFontSize * 0.9),
    fonts
  );
  const minValueW = Math.min(valueMeasuredW + edgePad * 2, innerW * 0.55);
  const fitsSideBySide = innerW >= labelMeasuredW + minValueW + gap + edgePad * 2;

  if (!fitsSideBySide) {
    const labelBlockH = Math.min(innerH * 0.46, Math.max(labelSize * 1.35, innerH * 0.38));
    const valueH = Math.max(4, innerH - labelBlockH - gap);
    labelSize = fitFontSize(doc, label, layoutLabelFont, innerW - edgePad * 2, labelBlockH, labelSize, 4, fonts);

    drawTextInClip(doc, label, innerX, innerY, innerW, labelBlockH, {
      font: renderLabelFont,
      layoutFont: layoutLabelFont,
      fontSize: labelSize,
      color: '#00401A',
      align: 'right',
      padX: edgePad,
      padY: 0,
    }, fonts);

    const valueSize = fitFontSize(doc, display, layoutValueFont, innerW - edgePad * 2, valueH, baseFontSize, 3.5, fonts);
    drawTextInClip(doc, display, innerX, innerY + labelBlockH + gap, innerW, valueH, {
      font: renderValueFont,
      layoutFont: layoutValueFont,
      fontSize: valueSize,
      color: style.color ?? '#111111',
      align: valueAlign,
      padX: edgePad,
      padY: 0,
    }, fonts);

    doc.restore();
    return;
  }

  const labelW = Math.min(innerW - gap - minValueW, labelMeasuredW + edgePad * 2);
  const valueW = Math.max(minValueW, innerW - labelW - gap);
  const labelX = innerX + innerW - labelW;
  const valueSize = fitFontSize(doc, display, layoutValueFont, valueW - edgePad, innerH, baseFontSize, 3.5, fonts);

  drawTextInClip(doc, label, labelX, innerY, labelW, innerH, {
    font: renderLabelFont,
    layoutFont: layoutLabelFont,
    fontSize: labelSize,
    color: '#00401A',
    align: 'right',
    padX: edgePad,
    padY: 0,
  }, fonts);

  drawTextInClip(doc, display, innerX, innerY, valueW, innerH, {
    font: renderValueFont,
    layoutFont: layoutValueFont,
    fontSize: valueSize,
    color: style.color ?? '#111111',
    align: valueAlign,
    padX: edgePad,
    padY: 0,
  }, fonts);

  doc.restore();
}

function drawRowCropImage(
  doc: InstanceType<typeof PDFDocument>,
  buffer: Buffer,
  px: number,
  py: number,
  pw: number,
  ph: number,
  inset: number
) {
  const ix = px + inset;
  const iy = py + inset;
  const iw = Math.max(1, pw - inset * 2);
  const ih = Math.max(1, ph - inset * 2);

  doc.save();
  doc.rect(ix, iy, iw, ih).clip();
  // Match designer: object-cover object-left — fill the element box, align row to the left.
  doc.image(buffer, ix, iy, {
    cover: [iw, ih],
    valign: 'center',
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
          doc.ellipse(cx, cy, pw / 2, ph / 2);
          strokePdfBorder(doc, style.borderColor, style.borderStyle, style.borderWidth ?? 1);
        }
      } else if (style.backgroundColor) {
        if (radius > 0) drawRoundedRect(doc, px, py, pw, ph, radius, style.backgroundColor);
        else doc.rect(px, py, pw, ph).fill(style.backgroundColor);
      }
      if (el.type === 'rect' && style.borderColor && (style.borderWidth ?? 0) > 0) {
        doc.rect(px, py, pw, ph);
        strokePdfBorder(doc, style.borderColor, style.borderStyle, style.borderWidth ?? 1);
      }
      continue;
    }

    if (el.type === 'text') {
      drawElementText(doc, px, py, pw, ph, el.text ?? '', el, fonts, scale);
      continue;
    }

    if (el.type === 'label') {
      drawElementText(doc, px, py, pw, ph, resolveLabelElementText(el), el, fonts, scale);
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
        doc.rect(px, py, pw, ph);
        strokePdfBorder(doc, style.borderColor, style.borderStyle, style.borderWidth ?? 1);
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
          const isRowCrop = el.imageFieldId === 'rowCrop';
          const innerW = Math.max(1, pw - inset * 2);
          const innerH = Math.max(1, ph - inset * 2);
          if (isRowCrop) {
            drawRowCropImage(doc, buffer, px, py, pw, ph, inset);
          } else {
            doc.image(buffer, px + inset, py + inset, {
              fit: [innerW, innerH],
              align: 'center',
              valign: 'center',
            });
          }
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
