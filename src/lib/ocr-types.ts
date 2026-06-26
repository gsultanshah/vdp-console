import type { OcrVoterTableMeta, OcrVoterTableRow } from '@/lib/voter-table-extraction';

export type { OcrVoterTableRow, OcrVoterTableMeta } from '@/lib/voter-table-extraction';

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
  voterTableRows?: OcrVoterTableRow[];
  voterTableMeta?: OcrVoterTableMeta;
  skewAngle: number;
  ocrAt: string;
  imageUrl: string;
}

export interface OcrPipelineResult {
  ocr_data: OcrDataPayload;
  finalJson: OcrVoterRow[];
}
