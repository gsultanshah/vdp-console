'use client';

import { useCallback, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { EXPORT_FILE_SIZE_UI_MB, type ExportFormat, type ExportGenderFilter, type ExportMode } from '@/lib/export-fields';
import type { ExportJobClient } from '@/lib/voter-export-ui';

interface StartExportPayload {
  halkaNames: string[];
  blockCodes: string[];
  selectAllBlockCodes?: boolean;
  fields?: string[];
  includeTableColumns?: boolean;
  format: ExportFormat;
  mode: ExportMode;
  genderFilter?: ExportGenderFilter;
  splitLargeFiles?: boolean;
}

interface UseVoterExportOptions {
  blockCodeFilter?: string;
  autoDownloadOnComplete?: boolean;
  jobsListUrl?: string;
}

export function useVoterExport(options: UseVoterExportOptions = {}) {
  const {
    blockCodeFilter,
    autoDownloadOnComplete = true,
    jobsListUrl = blockCodeFilter
      ? `/api/exports/?blockCode=${encodeURIComponent(blockCodeFilter)}`
      : '/api/exports/',
  } = options;

  const [activeJob, setActiveJob] = useState<ExportJobClient | null>(null);
  const [previousJobs, setPreviousJobs] = useState<ExportJobClient[]>([]);
  const [isStarting, setIsStarting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const abortRef = useRef(false);

  const loadPreviousJobs = useCallback(async () => {
    try {
      const response = await fetch(jobsListUrl);
      if (!response.ok) {
        return;
      }
      const data = await response.json();
      setPreviousJobs(data.jobs ?? []);
    } catch {
      // ignore list errors
    }
  }, [jobsListUrl]);

  const downloadFile = useCallback(async (jobId: string, fileName: string) => {
    try {
      const response = await fetch(
        `/api/exports/${jobId}/download/?file=${encodeURIComponent(fileName)}`
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Download failed');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Download failed');
    }
  }, []);

  const downloadCompletedJob = useCallback(
    async (job: ExportJobClient) => {
      const files =
        job.outputFiles.length > 0
          ? job.outputFiles
          : job.combinedFileName
            ? [
                {
                  fileName: job.combinedFileName,
                  sizeBytes: 0,
                  rowCount: 0,
                  blockCode: null,
                  halkaName: null,
                },
              ]
            : [];

      for (const file of files) {
        await downloadFile(job._id, file.fileName);
      }
    },
    [downloadFile]
  );

  const runExportLoop = useCallback(
    async (jobId: string) => {
      abortRef.current = false;
      setIsProcessing(true);

      try {
        while (!abortRef.current) {
          const response = await fetch(`/api/exports/${jobId}/process/`, { method: 'POST' });
          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || 'Export batch failed');
          }

          const job = data.job as ExportJobClient;
          setActiveJob(job);
          void loadPreviousJobs();

          if (['completed', 'failed', 'cancelled', 'size_exceeded'].includes(job.status)) {
            if (job.status === 'completed') {
              toast.success(
                job.outputFiles.length > 1
                  ? `Export completed (${job.outputFiles.length} files)`
                  : 'Export completed'
              );
              if (autoDownloadOnComplete) {
                await downloadCompletedJob(job);
              }
            } else if (job.status === 'size_exceeded') {
              toast.error(job.error || `Export exceeded ${EXPORT_FILE_SIZE_UI_MB} MB limit`);
            } else if (job.status === 'failed') {
              toast.error(job.error || 'Export failed');
            }
            break;
          }

          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Export failed');
      } finally {
        setIsProcessing(false);
      }
    },
    [autoDownloadOnComplete, downloadCompletedJob, loadPreviousJobs]
  );

  const startExport = useCallback(
    async (payload: StartExportPayload) => {
      setIsStarting(true);
      try {
        const response = await fetch('/api/exports/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to start export');
        }

        const job = data.job as ExportJobClient;
        setActiveJob(job);
        void loadPreviousJobs();
        await runExportLoop(job._id);
        return job;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to start export');
        return null;
      } finally {
        setIsStarting(false);
      }
    },
    [loadPreviousJobs, runExportLoop]
  );

  const resumeJob = useCallback(
    async (job: ExportJobClient) => {
      setActiveJob(job);
      await runExportLoop(job._id);
    },
    [runExportLoop]
  );

  const stopPolling = useCallback(() => {
    abortRef.current = true;
  }, []);

  return {
    activeJob,
    previousJobs,
    isStarting,
    isProcessing,
    loadPreviousJobs,
    downloadFile,
    startExport,
    resumeJob,
    stopPolling,
  };
}
