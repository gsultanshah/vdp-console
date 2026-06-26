import { extractVoterTableRows } from '@/lib/voter-table-extraction';
import type {
  OcrDataPayload,
  OcrProcessedRow,
  OcrVoterRow,
  OcrVoterTableMeta,
  OcrVoterTableRow,
} from '@/lib/ocr-types';

type VisionAnnotation = {
  description?: string | null;
  boundingPoly: { vertices: { x?: number; y?: number }[] };
};

function estimateSkewAngle(annotations: VisionAnnotation[]): number {
  const angles: number[] = [];
  annotations.forEach((annotation) => {
    const v0 = annotation.boundingPoly.vertices[0];
    const v1 = annotation.boundingPoly.vertices[1];
    if (v0 && v1 && v1.x != null && v0.x != null && v1.x - v0.x !== 0) {
      angles.push(Math.atan2((v1.y ?? 0) - (v0.y ?? 0), v1.x - v0.x));
    }
  });
  angles.sort((a, b) => a - b);
  return angles.length > 0 ? angles[Math.floor(angles.length / 2)] : 0;
}

function rotatePoint(x: number, y: number, angle: number) {
  return {
    x: Math.round(x * Math.cos(angle) - y * Math.sin(angle)),
    y: Math.round(x * Math.sin(angle) + y * Math.cos(angle)),
  };
}

function deskewAnnotations(annotations: VisionAnnotation[], angle: number): VisionAnnotation[] {
  return annotations.map((annotation) => ({
    ...annotation,
    boundingPoly: {
      ...annotation.boundingPoly,
      vertices: annotation.boundingPoly.vertices.map((v) =>
        rotatePoint(v.x ?? 0, v.y ?? 0, -angle)
      ),
    },
  }));
}

export function processRows(annotations: VisionAnnotation[]): OcrProcessedRow[] {
  const rows: OcrProcessedRow[] = [];
  let remainingAnnotations = [...annotations];

  while (remainingAnnotations.length > 0) {
    const firstElement = remainingAnnotations.reduce((lowest, current) => {
      const lowestY = Math.min(...lowest.boundingPoly.vertices.map((v) => v.y ?? 0));
      const currentY = Math.min(...current.boundingPoly.vertices.map((v) => v.y ?? 0));
      return currentY < lowestY ? current : lowest;
    });

    const rowHeight =
      Math.max(...firstElement.boundingPoly.vertices.map((v) => v.y ?? 0)) -
      Math.min(...firstElement.boundingPoly.vertices.map((v) => v.y ?? 0));

    const rowElements = remainingAnnotations.filter((annotation) => {
      const elementMinY = Math.min(...annotation.boundingPoly.vertices.map((v) => v.y ?? 0));
      return (
        elementMinY <=
        Math.min(...firstElement.boundingPoly.vertices.map((v) => v.y ?? 0)) + 2 * rowHeight
      );
    });

    const sortedElements = rowElements.sort((a, b) => {
      const aX = Math.min(...a.boundingPoly.vertices.map((v) => v.x ?? 0));
      const bX = Math.min(...b.boundingPoly.vertices.map((v) => v.x ?? 0));
      return aX - bX;
    });

    const row: OcrProcessedRow = {
      y: Math.min(...firstElement.boundingPoly.vertices.map((v) => v.y ?? 0)),
      elements: sortedElements.map((element) => {
        const vertices = element.boundingPoly.vertices;
        const minX = Math.min(...vertices.map((v) => v.x ?? 0));
        const maxX = Math.max(...vertices.map((v) => v.x ?? 0));
        const minY = Math.min(...vertices.map((v) => v.y ?? 0));
        const maxY = Math.max(...vertices.map((v) => v.y ?? 0));
        return {
          text: element.description ?? '',
          x: minX,
          width: maxX - minX,
          height: maxY - minY,
          vertices,
          printableText: (element.description ?? '').trim(),
        };
      }),
    };

    rows.push(row);
    remainingAnnotations = remainingAnnotations.filter((annotation) => !rowElements.includes(annotation));
  }

  return rows;
}

export function processRowData(rows: OcrProcessedRow[]): OcrVoterRow[] {
  const processedData: OcrVoterRow[] = [];

  rows.forEach((row, rowIndex) => {
    const sortedElements = [...row.elements].sort((a, b) => b.x - a.x);
    const silsila_no = sortedElements[0]?.text || '';
    const gharana_no = sortedElements[1]?.text || '';

    if (!silsila_no || Number.isNaN(Number(silsila_no))) {
      return;
    }

    const concatenatedString = sortedElements.slice(2).map((e) => e.text).join(' ');
    const cnicPattern = /\d{5}-\d{7}-\d/;
    const cnicMatch = concatenatedString.match(cnicPattern);
    const cnic = cnicMatch ? cnicMatch[0] : '';
    const remaining_text = concatenatedString.replace(cnicPattern, '').trim();

    processedData.push({
      row: rowIndex + 1,
      silsila_no,
      gharana_no,
      cnic,
      remaining_text,
    });
  });

  return processedData;
}

export function getVoterTableFromOcrData(ocrData: OcrDataPayload): {
  rows: OcrVoterTableRow[];
  meta: OcrVoterTableMeta | undefined;
} {
  if (ocrData.voterTableRows?.length) {
    return { rows: ocrData.voterTableRows, meta: ocrData.voterTableMeta };
  }

  const vision = ocrData.vision as {
    textAnnotations?: VisionAnnotation[];
    fullTextAnnotation?: { pages?: { width?: number; height?: number }[] };
  };
  const detections = vision.textAnnotations;
  if (!detections || detections.length <= 1) {
    return { rows: [], meta: undefined };
  }

  const annotations = detections.slice(1);
  const skewAngle = ocrData.skewAngle ?? estimateSkewAngle(annotations);
  const deskewed = deskewAnnotations(annotations, skewAngle);
  const page = vision.fullTextAnnotation?.pages?.[0];
  const pageWidth = page?.width ?? 2480;
  const pageHeight = page?.height ?? 3505;
  const { rows, meta } = extractVoterTableRows(deskewed, pageWidth, pageHeight);
  return { rows, meta };
}
