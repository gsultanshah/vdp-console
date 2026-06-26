import type { OcrRowElement } from '@/lib/ocr-types';
import { CLOUDINARY_CROP_WIDTH } from '@/lib/cloudinary-url';

const CNIC_PATTERN = /^\d{5}-\d{7}-\d$/;
const CNIC_SEARCH = /\d{5}-\d{7}-\d/;

export interface OcrCropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrVoterTableRow {
  rowIndex: number;
  cnic: string;
  silsila_no: string;
  name: string;
  father_name: string;
  profession: string;
  age: string;
  address: string;
  band: OcrCropRect;
  cnicBox: OcrCropRect;
  elements: OcrRowElement[];
  /** Cloudinary-style crop segment: c_crop,y_{y},h_{h},w_{w} */
  cropParams: string;
}

export interface OcrVoterTableMeta {
  firstCnicY: number;
  medianRowHeight: number;
  tableTopY: number;
  tableBottomY: number;
  voterCount: number;
}

type VisionAnnotation = {
  description?: string | null;
  boundingPoly: { vertices: { x?: number; y?: number }[] };
};

function bboxFromVertices(vertices: { x?: number; y?: number }[]): OcrCropRect {
  const xs = vertices.map((v) => v.x ?? 0);
  const ys = vertices.map((v) => v.y ?? 0);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function centerY(vertices: { x?: number; y?: number }[]): number {
  const ys = vertices.map((v) => v.y ?? 0);
  return (Math.min(...ys) + Math.max(...ys)) / 2;
}

function annotationToElement(annotation: VisionAnnotation): OcrRowElement {
  const vertices = annotation.boundingPoly.vertices;
  const box = bboxFromVertices(vertices);
  return {
    text: annotation.description ?? '',
    x: box.x,
    width: box.width,
    height: box.height,
    vertices,
    printableText: (annotation.description ?? '').trim(),
  };
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

interface CnicAnchor {
  cnic: string;
  element: OcrRowElement;
  minY: number;
  maxY: number;
  centerY: number;
}

function findCnicAnchors(annotations: VisionAnnotation[]): CnicAnchor[] {
  const anchors: CnicAnchor[] = [];

  for (const annotation of annotations) {
    const text = (annotation.description ?? '').trim();
    if (!CNIC_PATTERN.test(text)) continue;

    const element = annotationToElement(annotation);
    const vertices = annotation.boundingPoly.vertices;
    const minY = Math.min(...vertices.map((v) => v.y ?? 0));
    const maxY = Math.max(...vertices.map((v) => v.y ?? 0));

    anchors.push({
      cnic: text,
      element,
      minY,
      maxY,
      centerY: (minY + maxY) / 2,
    });
  }

  return anchors.sort((a, b) => a.centerY - b.centerY);
}

function findTableHeaderBottom(annotations: VisionAnnotation[]): number {
  const headerMarkers = ['شناختی', 'کارڈ', 'سلسلہ', 'سابقہ پتہ'];
  let maxY = 0;

  for (const annotation of annotations) {
    const text = (annotation.description ?? '').trim();
    if (!headerMarkers.some((m) => text.includes(m))) continue;
    const y = Math.max(...annotation.boundingPoly.vertices.map((v) => v.y ?? 0));
    maxY = Math.max(maxY, y);
  }

  return maxY > 0 ? maxY + 8 : 920;
}

function filterTableCnicAnchors(
  anchors: CnicAnchor[],
  headerBottomY: number,
  pageHeight: number
): CnicAnchor[] {
  const footerCutoff = pageHeight - 280;
  return anchors.filter(
    (a) => a.centerY > headerBottomY + 20 && a.centerY < footerCutoff
  );
}

function computeRowBands(
  anchors: CnicAnchor[],
  pageWidth: number,
  pageHeight: number,
  tableTopY: number
): OcrCropRect[] {
  if (!anchors.length) return [];

  const gaps = anchors.slice(1).map((a, i) => a.centerY - anchors[i].centerY);
  const medianGap = gaps.length ? median(gaps) : 92;
  const halfGap = Math.round(medianGap / 2);

  return anchors.map((anchor, index) => {
    const prev = anchors[index - 1];
    const next = anchors[index + 1];

    let top: number;
    if (prev) {
      top = Math.round((prev.maxY + anchor.minY) / 2);
    } else {
      top = Math.max(tableTopY, Math.round(anchor.minY - halfGap));
    }

    let bottom: number;
    if (next) {
      bottom = Math.round((anchor.maxY + next.minY) / 2);
    } else {
      bottom = Math.min(pageHeight, Math.round(anchor.maxY + halfGap));
    }

    const height = Math.max(40, bottom - top);

    return {
      x: 0,
      y: top,
      width: pageWidth,
      height,
    };
  });
}

function joinBandText(elements: OcrRowElement[], minX: number, maxX: number): string {
  return elements
    .filter((e) => {
      const centerX = e.x + e.width / 2;
      return centerX >= minX && centerX <= maxX;
    })
    .sort((a, b) => b.x - a.x)
    .map((e) => e.printableText)
    .filter(Boolean)
    .join(' ')
    .trim();
}

function parseVoterFields(elements: OcrRowElement[], cnic: string) {
  const rest = elements.filter(
    (e) => e.printableText !== cnic && !CNIC_SEARCH.test(e.printableText)
  );

  const silsila_no =
    rest
      .filter((e) => /^\d{1,4}$/.test(e.printableText) && e.x > 2200)
      .sort((a, b) => b.x - a.x)[0]?.printableText ?? '';

  const name = joinBandText(rest, 2050, 2300);
  const father_name = joinBandText(rest, 1700, 2050);
  const profession = joinBandText(rest, 1050, 1200);
  const age =
    rest
      .filter((e) => /^\d{1,3}$/.test(e.printableText) && e.x > 900 && e.x < 1020)
      .map((e) => e.printableText)[0] ?? '';
  const address = joinBandText(rest, 0, 950);

  return { silsila_no, name, father_name, profession, age, address };
}

export function formatCropParams(rect: OcrCropRect): string {
  return `c_crop,y_${Math.round(rect.y)},h_${Math.round(rect.height)},w_${CLOUDINARY_CROP_WIDTH}`;
}

export function extractVoterTableRows(
  annotations: VisionAnnotation[],
  pageWidth: number,
  pageHeight: number
): { rows: OcrVoterTableRow[]; meta: OcrVoterTableMeta } {
  const headerBottomY = findTableHeaderBottom(annotations);
  const tableTopY = headerBottomY + 12;

  const allAnchors = findCnicAnchors(annotations);
  const anchors = filterTableCnicAnchors(allAnchors, headerBottomY, pageHeight);

  if (!anchors.length) {
    return {
      rows: [],
      meta: {
        firstCnicY: 0,
        medianRowHeight: 0,
        tableTopY,
        tableBottomY: tableTopY,
        voterCount: 0,
      },
    };
  }

  const bands = computeRowBands(anchors, pageWidth, pageHeight, tableTopY);
  const gaps = anchors.slice(1).map((a, i) => a.centerY - anchors[i].centerY);
  const medianRowHeight = gaps.length ? Math.round(median(gaps)) : Math.round(bands[0]?.height ?? 90);

  const rows: OcrVoterTableRow[] = anchors.map((anchor, index) => {
    const band = bands[index];
    const bandBottom = band.y + band.height;

    const rowElements = annotations
      .filter((annotation) => {
        const cy = centerY(annotation.boundingPoly.vertices);
        return cy >= band.y && cy < bandBottom;
      })
      .map(annotationToElement)
      .sort((a, b) => b.x - a.x);

    const fields = parseVoterFields(rowElements, anchor.cnic);
    const cnicBox = bboxFromVertices(anchor.element.vertices);

    return {
      rowIndex: index + 1,
      cnic: anchor.cnic,
      ...fields,
      band,
      cnicBox,
      elements: rowElements,
      cropParams: formatCropParams(band),
    };
  });

  const lastBand = bands[bands.length - 1];

  return {
    rows,
    meta: {
      firstCnicY: Math.round(anchors[0].minY),
      medianRowHeight,
      tableTopY: bands[0]?.y ?? tableTopY,
      tableBottomY: lastBand ? lastBand.y + lastBand.height : tableTopY,
      voterCount: rows.length,
    },
  };
}
