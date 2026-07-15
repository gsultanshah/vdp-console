import path from 'path';
import { existsSync } from 'fs';
import type PDFDocument from 'pdfkit';
import type { RegisteredParchiFonts } from '@/lib/voter-parchi/parchi-fonts';

export interface ParchiFontPaths {
  nastaliqPath: string | null;
  arabicPath: string | null;
  latinPath: string | null;
}

export function resolveParchiFontPaths(): ParchiFontPaths {
  const cwd = process.cwd();
  const nastaliqCandidates = [
    path.join(cwd, 'assets/fonts/NotoNastaliqUrdu-Regular.ttf'),
    path.join(cwd, 'public/fonts/NotoNastaliqUrdu-Regular.ttf'),
    '/usr/share/fonts/truetype/noto/NotoNastaliqUrdu-Regular.ttf',
  ];
  const arabicCandidates = [
    path.join(cwd, 'assets/fonts/NotoSansArabic-Regular.ttf'),
    path.join(cwd, 'public/fonts/NotoSansArabic-Regular.ttf'),
    '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
    '/Library/Fonts/Arial Unicode.ttf',
    '/usr/share/fonts/truetype/noto/NotoSansArabic-Regular.ttf',
  ];
  const latinCandidates = [
    path.join(cwd, 'assets/fonts/NotoSans-Regular.ttf'),
    path.join(cwd, 'public/fonts/NotoSans-Regular.ttf'),
    '/System/Library/Fonts/Supplemental/Arial.ttf',
    '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  ];

  const resolveFirst = (candidates: string[]) => candidates.find((candidate) => existsSync(candidate)) ?? null;

  return {
    nastaliqPath: resolveFirst(nastaliqCandidates),
    arabicPath: resolveFirst(arabicCandidates),
    latinPath: resolveFirst(latinCandidates),
  };
}

export function registerParchiPdfFonts(
  doc: InstanceType<typeof PDFDocument>,
  paths: ParchiFontPaths = resolveParchiFontPaths()
): RegisteredParchiFonts {
  const fallback = 'Helvetica';
  let nastaliq: string | null = null;
  let arabic: string | null = null;
  let latin: string | null = null;

  if (paths.nastaliqPath) {
    doc.registerFont('ParchiNastaliq', paths.nastaliqPath);
    nastaliq = 'ParchiNastaliq';
  }
  if (paths.arabicPath) {
    if (paths.arabicPath === paths.nastaliqPath) {
      arabic = nastaliq;
    } else {
      doc.registerFont('ParchiArabic', paths.arabicPath);
      arabic = 'ParchiArabic';
    }
  }
  if (paths.latinPath) {
    if (paths.latinPath === paths.arabicPath) {
      latin = arabic;
    } else if (paths.latinPath === paths.nastaliqPath) {
      latin = nastaliq;
    } else {
      doc.registerFont('ParchiLatin', paths.latinPath);
      latin = 'ParchiLatin';
    }
  }

  return { nastaliq, arabic, latin, fallback };
}
