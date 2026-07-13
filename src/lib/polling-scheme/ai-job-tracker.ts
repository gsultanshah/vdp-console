import { getFirebaseDatabase } from '@/lib/firebase-admin';
import { isFirebasePipelineConfigured } from '@/config/firebase';
import type { PollingSchemeAiJob, PollingSchemeAiLogEntry } from '@/lib/polling-scheme/ai-job-types';

function halkaKey(halkaName: string): string {
  return halkaName.replace(/\s+/g, '').toUpperCase().replace(/[.#$/[\]]/g, '_');
}

function jobRef(halkaName: string, jobId: string) {
  const db = getFirebaseDatabase();
  if (!db) {
    return null;
  }
  return db.ref(`polling-scheme-ai/${halkaKey(halkaName)}/jobs/${jobId}`);
}

function firebaseSafe<T extends Record<string, unknown>>(value: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    if (val !== undefined) {
      result[key] = val;
    }
  }
  return result as T;
}

function runWrite(label: string, task: () => Promise<void>): void {
  if (!isFirebasePipelineConfigured()) {
    return;
  }
  void task().catch((error) => {
    console.error(`[polling-scheme-ai] ${label} failed:`, error);
  });
}

export function mirrorPollingSchemeAiJob(job: PollingSchemeAiJob): void {
  runWrite('mirror job', async () => {
    const ref = jobRef(job.halkaName, job._id);
    if (!ref) {
      return;
    }
    await ref.set(
      firebaseSafe({
        jobId: job._id,
        halkaName: job.halkaName,
        status: job.status,
        fileName: job.fileName,
        fileHash: job.fileHash,
        pageCount: job.pageCount,
        counters: job.counters,
        updatedAt: Date.now(),
        completedAt: job.completedAt ? Date.parse(job.completedAt) : undefined,
        errorMessage: job.errorMessage,
        recentLogs: job.logs.slice(-20),
      })
    );
  });
}

export function appendPollingSchemeAiLog(
  halkaName: string,
  jobId: string,
  entry: PollingSchemeAiLogEntry
): void {
  runWrite('append log', async () => {
    const ref = jobRef(halkaName, jobId);
    if (!ref) {
      return;
    }
    const logsRef = ref.child('recentLogs');
    const snapshot = await logsRef.get();
    const existing = snapshot.exists() ? (snapshot.val() as PollingSchemeAiLogEntry[]) : [];
    const next = Array.isArray(existing) ? [...existing, entry].slice(-20) : [entry];
    await logsRef.set(next);
    await ref.update({ updatedAt: Date.now() });
  });
}
