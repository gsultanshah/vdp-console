'use client';

import { useCallback, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import type { VoterParchiJob } from '@/lib/voter-parchi/types';

interface StartParchiJobPayload {
  halkaName: string;
  designId: string;
  blockCodes?: string[];
  selectAllBlockCodes?: boolean;
  genderFilter?: 'both' | 'male' | 'female';
}

interface UseVoterParchiOptions {
  blockCodeFilter?: string;
  autoDownloadOnComplete?: boolean;
}

function blockCodeMatchesFilter(job: VoterParchiJob, blockCode: string): boolean {
  if (job.selectAllBlockCodes) return false;
  const target = blockCode.replace(/\D/g, '');
  return job.blockCodes.some((code) => {
    const digits = String(code).replace(/\D/g, '');
    return digits === target || code === blockCode;
  });
}

export function useVoterParchi(halkaName: string, options: UseVoterParchiOptions = {}) {
  const { blockCodeFilter, autoDownloadOnComplete = false } = options;
  const [activeJob, setActiveJob] = useState<VoterParchiJob | null>(null);
  const [previousJobs, setPreviousJobs] = useState<VoterParchiJob[]>([]);
  const [isStarting, setIsStarting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const abortRef = useRef(false);

  const downloadFile = useCallback(async (jobId: string, fileName: string) => {
    try {
      const url = `/api/voter-parchi/jobs/${jobId}/download/?file=${encodeURIComponent(fileName)}`;
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || 'Download failed');
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Download failed');
    }
  }, []);

  const downloadCompletedJob = useCallback(
    async (job: VoterParchiJob) => {
      if (!job._id || job.outputFiles.length === 0) return;
      for (const file of job.outputFiles) {
        await downloadFile(job._id, file.fileName);
      }
    },
    [downloadFile]
  );

  const loadPreviousJobs = useCallback(async () => {
    try {
      const params = new URLSearchParams({ halkaName });
      const response = await fetch(`/api/voter-parchi/jobs?${params.toString()}`);
      if (!response.ok) return;
      const data = (await response.json()) as { jobs?: VoterParchiJob[] };
      let jobs = data.jobs ?? [];
      if (blockCodeFilter) {
        jobs = jobs.filter((job) => blockCodeMatchesFilter(job, blockCodeFilter));
      }
      setPreviousJobs(jobs);
    } catch {
      // ignore
    }
  }, [halkaName, blockCodeFilter]);

  const processUntilDone = useCallback(
    async (jobId: string) => {
      abortRef.current = false;
      setIsProcessing(true);

      try {
        while (!abortRef.current) {
          const response = await fetch(`/api/voter-parchi/jobs/${jobId}/process`, { method: 'POST' });
          const data = (await response.json()) as { job?: VoterParchiJob; error?: string };
          if (!response.ok) {
            throw new Error(data.error || 'Processing failed');
          }
          const job = data.job;
          if (!job) break;
          setActiveJob(job);

          if (['completed', 'failed', 'cancelled'].includes(job.status)) {
            if (job.status === 'completed') {
              toast.success(`Generated ${job.outputFiles.length} PDF file(s)`);
              if (autoDownloadOnComplete) {
                await downloadCompletedJob(job);
              }
            } else if (job.status === 'failed') {
              toast.error(job.error || 'Generation failed');
            }
            break;
          }
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Processing failed');
      } finally {
        setIsProcessing(false);
        void loadPreviousJobs();
      }
    },
    [autoDownloadOnComplete, downloadCompletedJob, loadPreviousJobs]
  );

  const startJob = useCallback(
    async (payload: StartParchiJobPayload) => {
      setIsStarting(true);
      try {
        const response = await fetch('/api/voter-parchi/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = (await response.json()) as { job?: VoterParchiJob; error?: string };
        if (!response.ok) throw new Error(data.error || 'Failed to start job');
        const job = data.job;
        if (!job?._id) throw new Error('Invalid job response');
        setActiveJob(job);
        toast.success('Parchi generation started');
        await processUntilDone(job._id);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to start job');
      } finally {
        setIsStarting(false);
      }
    },
    [processUntilDone]
  );

  const cancelProcessing = useCallback(() => {
    abortRef.current = true;
  }, []);

  return {
    activeJob,
    previousJobs,
    isStarting,
    isProcessing,
    loadPreviousJobs,
    startJob,
    cancelProcessing,
    downloadFile,
  };
}
