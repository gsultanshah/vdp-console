import type { VoterEnrichPageResult } from '@/lib/voter-document';
import { trackBlockCodeTitleTagged, trackPageStageUpdate } from '@/lib/pipeline-tracker';

interface PageRef {
  halkaName: string;
  blockCode: string;
  pageId: string;
  fileName?: string;
}

export function pipelineTrackOcrComplete(page: PageRef): void {
  trackPageStageUpdate({
    halkaName: page.halkaName,
    blockCode: page.blockCode,
    pageId: page.pageId,
    fileName: page.fileName,
    stage: 'ocr',
    status: 'completed',
  });
}

export function pipelineTrackProcessingComplete(page: PageRef, voterCount: number): void {
  trackPageStageUpdate({
    halkaName: page.halkaName,
    blockCode: page.blockCode,
    pageId: page.pageId,
    fileName: page.fileName,
    stage: 'processing',
    status: 'completed',
  });

  trackPageStageUpdate({
    halkaName: page.halkaName,
    blockCode: page.blockCode,
    pageId: page.pageId,
    fileName: page.fileName,
    stage: 'enrichment',
    status: voterCount > 0 ? 'pending' : 'completed',
  });
}

export function pipelineTrackProcessingError(page: PageRef, error: string): void {
  trackPageStageUpdate({
    halkaName: page.halkaName,
    blockCode: page.blockCode,
    pageId: page.pageId,
    fileName: page.fileName,
    stage: 'processing',
    status: 'error',
    error,
  });
}

export function pipelineTrackEnrichmentComplete(page: PageRef, enrich: VoterEnrichPageResult): void {
  trackPageStageUpdate({
    halkaName: page.halkaName,
    blockCode: page.blockCode,
    pageId: page.pageId,
    fileName: page.fileName,
    stage: 'enrichment',
    status: 'completed',
  });

  const passed = enrich.errors === 0;
  trackPageStageUpdate({
    halkaName: page.halkaName,
    blockCode: page.blockCode,
    pageId: page.pageId,
    fileName: page.fileName,
    stage: 'integrity',
    status: passed ? 'completed' : 'failed',
    integrityPassed: passed,
    error: passed ? undefined : `${enrich.errors} enrich error(s)`,
  });
}

export function pipelineTrackTitleTagged(halkaName: string, blockCode: string, pageCount: number): void {
  trackBlockCodeTitleTagged(halkaName, blockCode, pageCount);
}
