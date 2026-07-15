export type ParchiFontFamily = 'nastaliq' | 'sans' | 'latin';

export const PARCHI_FONT_FAMILY_OPTIONS: { id: ParchiFontFamily; label: string }[] = [
  { id: 'nastaliq', label: 'Nastaliq Urdu' },
  { id: 'sans', label: 'Sans Arabic' },
  { id: 'latin', label: 'Latin / numbers' },
];

export interface RegisteredParchiFonts {
  nastaliq: string | null;
  arabic: string | null;
  latin: string | null;
  fallback: string;
}

const URDU_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

export function textPrefersLatin(text: string): boolean {
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  const arabic = (text.match(URDU_RE) ?? []).length;
  return latin > 0 && latin >= arabic;
}

export function pickPdfFont(
  text: string,
  family: ParchiFontFamily | undefined,
  fonts: RegisteredParchiFonts
): string {
  const trimmed = text.trim();
  if (/^[\d\s\-+().,/:%#]+$/.test(trimmed)) {
    return fonts.latin ?? fonts.arabic ?? fonts.nastaliq ?? fonts.fallback;
  }
  if (textPrefersLatin(text)) {
    return fonts.latin ?? fonts.arabic ?? fonts.nastaliq ?? fonts.fallback;
  }

  if (family === 'latin') {
    return fonts.latin ?? fonts.arabic ?? fonts.nastaliq ?? fonts.fallback;
  }
  if (family === 'sans') {
    return fonts.arabic ?? fonts.nastaliq ?? fonts.latin ?? fonts.fallback;
  }
  return fonts.nastaliq ?? fonts.arabic ?? fonts.latin ?? fonts.fallback;
}

/** PDFKit/fontkit cannot measure Nastaliq reliably — use Sans Arabic for layout math. */
export function pickPdfLayoutFont(
  text: string,
  family: ParchiFontFamily | undefined,
  fonts: RegisteredParchiFonts
): string {
  const trimmed = text.trim();
  if (/^[\d\s\-+().,/:%#]+$/.test(trimmed) || textPrefersLatin(text) || family === 'latin') {
    return fonts.latin ?? fonts.arabic ?? fonts.fallback;
  }
  return fonts.arabic ?? fonts.latin ?? fonts.fallback;
}

export function pdfFontFallback(fonts: RegisteredParchiFonts): string {
  return fonts.arabic ?? fonts.latin ?? fonts.fallback;
}

export function cssFontFamily(family: ParchiFontFamily | undefined): string | undefined {
  if (family === 'latin') {
    return "'Noto Sans', Arial, sans-serif";
  }
  if (family === 'sans') {
    return "'Noto Sans Arabic', 'Noto Sans', Arial, sans-serif";
  }
  return "'Noto Nastaliq Urdu', 'Noto Sans Arabic', 'Noto Sans', Arial, sans-serif";
}

export const DEFAULT_URDU_FONT_FAMILY: ParchiFontFamily = 'nastaliq';
