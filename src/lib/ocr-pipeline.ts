import axios from 'axios';
import { detectTextInImage } from '@/lib/google-vision-client';
import { extractVoterTableRows } from '@/lib/voter-table-extraction';
import { processRowData, processRows } from '@/lib/ocr-processing';
import type { OcrDataPayload, OcrPipelineResult } from '@/lib/ocr-types';

export type {
  OcrDataPayload,
  OcrPipelineResult,
  OcrProcessedRow,
  OcrRowElement,
  OcrVoterRow,
  OcrVoterTableMeta,
  OcrVoterTableRow,
} from '@/lib/ocr-types';

export { getVoterTableFromOcrData, processRowData, processRows } from '@/lib/ocr-processing';

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
  const fullText = visionResult as {
    fullTextAnnotation?: { pages?: { width?: number; height?: number }[] };
  };
  const page = fullText.fullTextAnnotation?.pages?.[0];
  const pageWidth = page?.width ?? 2480;
  const pageHeight = page?.height ?? 3505;
  const { rows: voterTableRows, meta: voterTableMeta } = extractVoterTableRows(
    deskewedAnnotations,
    pageWidth,
    pageHeight
  );
  const finalJson =
    voterTableRows.length > 0
      ? voterTableRows.map((row) => ({
          row: row.rowIndex,
          silsila_no: row.silsila_no,
          gharana_no: row.name || row.father_name,
          cnic: row.cnic,
          remaining_text: [row.father_name, row.profession, row.age, row.address]
            .filter(Boolean)
            .join(' '),
        }))
      : processRowData(processedRows);
  const ocrAt = new Date().toISOString();

  const ocr_data: OcrDataPayload = {
    vision: serializeVisionResult(visionResult),
    finalJson,
    processedRows,
    voterTableRows,
    voterTableMeta,
    skewAngle,
    ocrAt,
    imageUrl,
  };

  return { ocr_data, finalJson };
}
