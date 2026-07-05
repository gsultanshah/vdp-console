import type { ExportFormat, ExportMode } from '@/lib/export-fields';

export interface ExportOutputFile {
  blockCode: string | null;
  halkaName: string | null;
  fileName: string;
  sizeBytes: number;
  rowCount: number;
}

export interface ExportJobClient {
  _id: string;
  status: string;
  halkaNames: string[];
  blockCodes: string[];
  fields: string[];
  format: ExportFormat;
  mode: ExportMode;
  splitLargeFiles?: boolean;
  totalVoters: number;
  processedVoters: number;
  progressPercent: number;
  currentBlockCode: string | null;
  outputFiles: ExportOutputFile[];
  combinedFileName: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  resumable: boolean;
}

export function formatExportBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function exportStatusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'running':
      return 'Running';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    case 'cancelled':
      return 'Cancelled';
    case 'size_exceeded':
      return 'Size limit exceeded';
    default:
      return status;
  }
}

export function exportJobFiles(job: ExportJobClient): ExportOutputFile[] {
  if (job.outputFiles.length > 0) {
    return job.outputFiles;
  }
  if (job.combinedFileName) {
    return [
      {
        fileName: job.combinedFileName,
        sizeBytes: 0,
        rowCount: job.processedVoters,
        blockCode: null,
        halkaName: null,
      },
    ];
  }
  return [];
}
