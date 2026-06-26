import axios from 'axios';
import { detectTextInImage } from '@/lib/google-vision-client';

export interface OcrRowElement {
  text: string;
  x: number;
  width: number;
  height: number;
  vertices: { x?: number; y?: number }[];
  printableText: string;
}

export interface OcrProcessedRow {
  y: number;
  elements: OcrRowElement[];
}

export interface OcrVoterRow {
  row: number;
  silsila_no: string;
  gharana_no: string;
  cnic: string;
  remaining_text: string;
}

export interface OcrDataPayload {
  vision: Record<string, unknown>;
  finalJson: OcrVoterRow[];
  processedRows: OcrProcessedRow[];
  skewAngle: number;
  ocrAt: string;
  imageUrl: string;
}

export interface OcrPipelineResult {
  ocr_data: OcrDataPayload;
  finalJson: OcrVoterRow[];
}

export function serializeVisionResult(result: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(result ?? {})) as Record<string, unknown>;
}

function estimateSkewAngle(annotations: { boundingPoly: { vertices: { x?: number; y?: number }[] } }[]): number {
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

function deskewAnnotations(
  annotations: { description?: string | null; boundingPoly: { vertices: { x?: number; y?: number }[] } }[],
  angle: number
) {
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

export function processRows(
  annotations: { description?: string | null; boundingPoly: { vertices: { x?: number; y?: number }[] } }[]
): OcrProcessedRow[] {
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

export async function runOcrPipeline(imageUrl: string): Promise<OcrPipelineResult> {
  const response = await axios.get(imageUrl, {
    responseType: 'arraybuffer',
    headers: { Accept: 'image/*' },
  });
  const imageBuffer = Buffer.from(response.data);

  if (!imageBuffer.length) {
    throw new Error('Invalid image data received');
  }

  const visionResult = await detectTextInImage(imageBuffer.toString('base64'));

  const detections = visionResult.textAnnotations;
  if (!detections || detections.length === 0) {
    throw new Error('No text detected in image');
  }

  const annotations = detections.slice(1) as {
    description?: string | null;
    boundingPoly: { vertices: { x?: number; y?: number }[] };
  }[];
  const skewAngle = estimateSkewAngle(annotations);
  const deskewedAnnotations = deskewAnnotations(annotations, skewAngle);
  const processedRows = processRows(deskewedAnnotations);
  const finalJson = processRowData(processedRows);
  const ocrAt = new Date().toISOString();

  const ocr_data: OcrDataPayload = {
    vision: serializeVisionResult(visionResult),
    finalJson,
    processedRows,
    skewAngle,
    ocrAt,
    imageUrl,
  };

  return { ocr_data, finalJson };
}
