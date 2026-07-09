'use client';

import { useCallback, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import type { PhoneEnrichJobMeta } from '@/lib/phone-enrich/job-service';

export function usePhoneEnrich() {
  const [job, setJob] = useState<PhoneEnrichJobMeta | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const abortRef = useRef(false);

  const processUntilDone = useCallback(async (jobId: string): Promise<PhoneEnrichJobMeta | null> => {
    abortRef.current = false;
    setIsProcessing(true);
    let finalJob: PhoneEnrichJobMeta | null = null;

    try {
      while (!abortRef.current) {
        const response = await fetch(`/api/phone-data/enrich-excel/${jobId}/process`, {
          method: 'POST',
        });
        const data = (await response.json()) as { job?: PhoneEnrichJobMeta; error?: string };
        if (!response.ok) {
          throw new Error(data.error || 'Processing failed');
        }
        const nextJob = data.job;
        if (!nextJob) break;
        finalJob = nextJob;
        setJob(nextJob);

        if (['completed', 'failed'].includes(nextJob.status)) {
          if (nextJob.status === 'completed') {
            toast.success(`Enriched ${nextJob.outputRowCount.toLocaleString()} rows`);
          } else if (nextJob.error) {
            toast.error(nextJob.error);
          }
          break;
        }
      }
      return finalJob;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Processing failed');
      return finalJob;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const startEnrich = useCallback(
    async (file: File) => {
      setIsStarting(true);
      setJob(null);
      try {
        const formData = new FormData();
        formData.append('file', file);
        const response = await fetch('/api/phone-data/enrich-excel', { method: 'POST', body: formData });
        const data = (await response.json()) as { job?: PhoneEnrichJobMeta; error?: string };
        if (!response.ok) throw new Error(data.error || 'Failed to start enrichment');
        if (!data.job?.id) throw new Error('Invalid job response');
        setJob(data.job);
        return processUntilDone(data.job.id);
      } finally {
        setIsStarting(false);
      }
    },
    [processUntilDone]
  );

  const downloadResult = useCallback(async (jobId: string) => {
    const response = await fetch(`/api/phone-data/enrich-excel/${jobId}/download`);
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error || 'Download failed');
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'phone-enriched.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, []);

  const cancelProcessing = useCallback(() => {
    abortRef.current = true;
  }, []);

  return {
    job,
    isStarting,
    isProcessing,
    startEnrich,
    downloadResult,
    cancelProcessing,
  };
}
