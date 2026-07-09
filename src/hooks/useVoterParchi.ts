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

export function useVoterParchi(halkaName: string) {
  const [activeJob, setActiveJob] = useState<VoterParchiJob | null>(null);
  const [previousJobs, setPreviousJobs] = useState<VoterParchiJob[]>([]);
  const [isStarting, setIsStarting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const abortRef = useRef(false);

  const loadPreviousJobs = useCallback(async () => {
    try {
      const params = new URLSearchParams({ halkaName });
      const response = await fetch(`/api/voter-parchi/jobs?${params.toString()}`);
      if (!response.ok) return;
      const data = (await response.json()) as { jobs?: VoterParchiJob[] };
      setPreviousJobs(data.jobs ?? []);
    } catch {
      // ignore
    }
  }, [halkaName]);

  const processUntilDone = useCallback(async (jobId: string) => {
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
  }, [loadPreviousJobs]);

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
  };
}
