import { ImageAnnotatorClient } from '@google-cloud/vision';
import axios from 'axios';

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

let visionClient: ImageAnnotatorClient | null = null;

function getVisionClient(): ImageAnnotatorClient {
  if (visionClient) {
    return visionClient;
  }

  const credentials = {
    project_id: 'engaged-fact-460917-f7',
    private_key: process.env.GOOGLE_VISION_PRIVATE_KEY?.replace(/\\n/g, '\n') ??
      '-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCPqu/FcFOS5SSG\n1DizcSQ0eFSY2UiCokOkRJ1SbmZiacTJvG6Q6rKES5uKKrViZ0Ghy6ki1Q3tHeJG\nEZ2wChiTBeuAPXwkho5DtfcdOTxmrZTlGNmxDYIb5LNYFwLWHC0gYTW36HledlZF\nphZ3o3JWfITrL8zgTzhigMJizMKhjcs25cRlZedxO3O6vJgjRmZUbarZ/N8Yq5fz\nL7yKXMb35y/Np9K5rZpWX9ExybO38BuE3qlRInhNq9PDhsXY9LKxIOMXa2q2cu34\nNYmLM6VK2aD3Qd2WOXCKyAC8gScMViWmD1ZSrYeGGJ4zxxI986r2z1tjCkpCDnvX\n18NEuNfxAgMBAAECggEACS0n53qHPAi6zonbnUqKv3c4IBMw2Hc4ztM7ITq/+2U6\nFpCcl1EGWgDiTG7x6vkhbg4uHXVyUETqYQNbCRV8AFgOdMB4n3SgvZ5vzEQNoZlQ\nu1lc/jwYpWN0ORovKjHeiATtg3Or3Oa+F/DF2ppsAS4u5z7EXUdyGIiU4e6mN99Y\nLUD1ck/7eabHy1n/zjjbfdMGlqTVyJWhXCI7D0F8euv7KS46lOydB//mVnhkYP4y\nMkD6koXQ2Cj2KNl0SyYBC2ewcGodOqYHUmpSmsD30+ip1BF868spcMkN1f0GOH5T\nDjnkOSjFdpzjYm0ACISl3KpXX2zpuW6c1dA4gbM3YQKBgQDCRgmesIC/pHcW4CeO\nyEpu6LRvMzavh0A+2p82XdPN5ufrKQuXXyUI5nLy2XQZbLvRBy3LWx4QttznHeDx\ngZksm8hB2uP7nxcftMUtmzXNoCofdudSbYF7LHI5DNcEjiiwjZF7aYjwtZ2BxKRj\nLXKpLZ1YUgdKHPGhfrTSUyV77QKBgQC9UK74ni4REngyKKFRwDfqx+pgnCsRRSHX\ndYwMQoSV9+UWlR0p6i1yswSTlunqci/Qo+cfjQyjZsBZhEezhk6rTXFYsuTHuJyi\nFNwN1hZkRb9sLJyIJSqcsfdwaeTU+eyozNg3b97VOzz5++TEAmV2ouYtCK1Pv9E/\nWiw3pSWzlQKBgAEh42B3auizDrala9WbOUPYO2UCiWkQgsFbCN6KQXfLxsJKJPUm\n6tJYdYcQ2Wpkhdu8DPpId65lQnheZjdCKCBocAxiOD35OWtH5HZVl0SxkE1KpiKG\n3OBY6/mFJ6OxKG+PA7ASd2ffxyFAgizJ0QdHaslfAQffj1D/qhInxeopAoGAfdka\n127flL3AZSeZRa0P/uTyq1JlVs+sFXywop29Yawu//oULv7bQ3o5upsB2LYbjwjF\n5bVwB1eQ2nES8QaBWWLbzGjvqMzSYvSW7CO7MuEixRhK3j5Gu2+a24GpeuLBLd0u\nhnu5l+oPOOb4RkyJgnn7pUg1XeRXh1O8PSltjJkCgYA11qeyixdPXneQ3AnwmY2F\n3RXPaTarC+7vCoM9EuQvA+KctcQ9Elx2aovjO9fMEwy6iZNxKogfziPxdtAPuN76\nlE0Ur4ft4amoIg/1JIYSgJqAwZJSajsTJFWa+EmfWoCVhNXxiUfNRMHDHG0swCXo\nwOJUrx7K8xKs1TpTbBjRJA==\n-----END PRIVATE KEY-----\n',
    client_email:
      process.env.GOOGLE_VISION_CLIENT_EMAIL ??
      'vdp-console@engaged-fact-460917-f7.iam.gserviceaccount.com',
  };

  visionClient = new ImageAnnotatorClient({
    credentials: {
      client_email: credentials.client_email,
      private_key: credentials.private_key,
    },
    projectId: credentials.project_id,
  });

  return visionClient;
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

  const client = getVisionClient();
  const [visionResult] = await client.textDetection({
    image: { content: imageBuffer.toString('base64') },
  });

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
