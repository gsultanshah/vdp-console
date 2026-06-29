export type PipelineStageKey =
  | 'pdfExtract'
  | 'upload'
  | 'titleTagging'
  | 'ocr'
  | 'processing'
  | 'enrichment'
  | 'integrity';

export type PdfJobStep = 'received' | 'extracting' | 'uploading' | 'completed' | 'failed';

export interface PdfUploadJobPage {
  pageNumber: number;
  status: 'pending' | 'extracting' | 'extracted' | 'uploading' | 'uploaded' | 'failed';
  fileName?: string;
  pageId?: string;
  error?: string;
}

export interface PdfUploadJob {
  jobId: string;
  sessionId: string;
  blockCode: string;
  sourceFileName: string;
  halkaName: string;
  operatorId: string;
  status: PdfJobStep;
  totalPages: number;
  extractedPages: number;
  uploadedPages: number;
  failedPages: number;
  startedAt: number;
  updatedAt: number;
  error?: string;
  pages?: Record<string, PdfUploadJobPage>;
}

export interface StageCounts {
  total: number;
  completed: number;
  failed: number;
  inFlight: number;
  pending: number;
}

export interface PipelineMeta {
  updatedAt: number;
  activeUploadSessions: number;
  blockCodesTotal: number;
  stages: Record<PipelineStageKey, StageCounts>;
}

export interface UploadSession {
  sessionId: string;
  operatorId: string;
  startedAt: number;
  lastHeartbeatAt: number;
  status: 'running' | 'completed' | 'failed';
  currentBlockCode: string | null;
  filesUploaded: number;
  filesFailed: number;
  filesInFlight: number;
}

export interface PipelinePageState {
  pageId: string;
  blockCode: string;
  fileName: string;
  stage: PipelineStageKey | 'error';
  status: string;
  sessionId?: string;
  updatedAt: number;
  error?: string;
}

export const EMPTY_STAGE_COUNTS: StageCounts = {
  total: 0,
  completed: 0,
  failed: 0,
  inFlight: 0,
  pending: 0,
};

export function createEmptyPipelineMeta(): PipelineMeta {
  return {
    updatedAt: Date.now(),
    activeUploadSessions: 0,
    blockCodesTotal: 0,
    stages: {
      pdfExtract: { ...EMPTY_STAGE_COUNTS },
      upload: { ...EMPTY_STAGE_COUNTS },
      titleTagging: { ...EMPTY_STAGE_COUNTS },
      ocr: { ...EMPTY_STAGE_COUNTS },
      processing: { ...EMPTY_STAGE_COUNTS },
      enrichment: { ...EMPTY_STAGE_COUNTS },
      integrity: { ...EMPTY_STAGE_COUNTS },
    },
  };
}
