import type { PollingSchemeRowType, PollingStationGenderType } from '@/lib/polling-scheme/types';

export type PollingSchemeAiJobStatus =
  | 'pending_upload'
  | 'uploaded'
  | 'processing'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'partial';

export type PollingSchemeAiPageStatus =
  | 'pending'
  | 'uploading'
  | 'uploaded'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'skipped';

export interface PollingSchemeAiLogEntry {
  at: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  page?: number;
}

export interface PollingSchemeAiPageState {
  page: number;
  status: PollingSchemeAiPageStatus;
  imagePath?: string;
  imageHash?: string;
  rowsExtracted?: number;
  rowsUpserted?: number;
  rowsSkipped?: number;
  warnings?: string[];
  error?: string;
  processedAt?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}

export interface PollingSchemeAiJobCounters {
  pagesCompleted: number;
  pagesFailed: number;
  pagesTotal: number;
  rowsExtracted: number;
  rowsUpserted: number;
  rowsSkipped: number;
  warnings: number;
  errors: number;
}

export interface PollingSchemeAiStationContext {
  slNo: string;
  pollingStation: string;
  stationType: PollingStationGenderType;
  district: string;
}

export interface PollingSchemeAiExtractedRow {
  slNo: string;
  pollingStation: string;
  areaType: string;
  areaName: string;
  electoralRollCode: string;
  maleVoters: number;
  femaleVoters: number;
  totalVoters: number;
  maleBooths: string;
  femaleBooths: string;
  totalBooths: string;
  rowType: PollingSchemeRowType;
  stationType: PollingStationGenderType;
  sourceRawText: string;
  confidence: number;
  warnings: string[];
}

export interface PollingSchemeAiPageExtraction {
  page: number;
  district: string;
  rows: PollingSchemeAiExtractedRow[];
  stationContext: PollingSchemeAiStationContext | null;
  warnings: string[];
  confidence: number;
}

export interface PollingSchemeAiJob {
  _id: string;
  halkaName: string;
  district: string;
  status: PollingSchemeAiJobStatus;
  fileName: string;
  fileHash: string;
  fileSizeBytes: number;
  pageCount: number | null;
  sourceStoragePath: string;
  sourceFileUrl?: string;
  pages: PollingSchemeAiPageState[];
  counters: PollingSchemeAiJobCounters;
  logs: PollingSchemeAiLogEntry[];
  lastStationContext: PollingSchemeAiStationContext | null;
  operator: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  errorMessage?: string;
}

export interface CreatePollingSchemeAiJobInput {
  halkaName: string;
  district?: string;
  fileName: string;
  fileHash: string;
  fileSizeBytes: number;
  operator: string;
}

export const MAX_POLLING_SCHEME_PDF_BYTES = 100 * 1024 * 1024;
export const MAX_AI_JOB_LOGS = 200;
export const POLLING_SCHEME_AI_COLLECTION = 'polling_scheme_ai_jobs';

export function pollingSchemeStorageBase(halkaName: string, fileHash: string): string {
  const halka = halkaName.replace(/\s+/g, '').toUpperCase();
  return `polling-schemes/${halka}/${fileHash}`;
}

export function pollingSchemeSourcePath(halkaName: string, fileHash: string): string {
  return `${pollingSchemeStorageBase(halkaName, fileHash)}/source.pdf`;
}

export function pollingSchemePagePath(halkaName: string, fileHash: string, page: number): string {
  const pageLabel = String(page).padStart(4, '0');
  return `${pollingSchemeStorageBase(halkaName, fileHash)}/pages/page-${pageLabel}.jpg`;
}
