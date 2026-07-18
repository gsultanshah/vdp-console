import { connectNativeMongoClient } from '@/lib/mongo-client';
import { AUTOMATION_LOGS_COLLECTION } from '@/lib/automation-config';

export interface AutomationLogEntry {
  _id: string;
  ts: string;
  level: string;
  action: string;
  source: string;
  halkaName: string | null;
  blockCode: string | null;
  pageId: string | null;
  jobId: string | null;
  correlationId: string | null;
  message: string;
  details: unknown;
  ok: boolean;
}

export async function queryAutomationLogs(input: {
  halkaName?: string;
  level?: string;
  action?: string;
  q?: string;
  limit?: number;
  before?: string;
}): Promise<AutomationLogEntry[]> {
  const client = await connectNativeMongoClient();
  const db = client.db('vdp');
  const filter: Record<string, unknown> = {};

  if (input.halkaName) {
    filter.halkaName = input.halkaName.replace(/\s+/g, '').toUpperCase();
  }
  if (input.level) {
    filter.level = input.level;
  }
  if (input.action) {
    filter.action = input.action;
  }
  if (input.before) {
    filter.ts = { $lt: new Date(input.before) };
  }
  if (input.q) {
    filter.$or = [
      { message: { $regex: input.q, $options: 'i' } },
      { blockCode: { $regex: input.q, $options: 'i' } },
      { jobId: { $regex: input.q, $options: 'i' } },
      { correlationId: { $regex: input.q, $options: 'i' } },
    ];
  }

  const limit = Math.max(1, Math.min(200, input.limit ?? 50));
  const docs = await db
    .collection(AUTOMATION_LOGS_COLLECTION)
    .find(filter)
    .sort({ ts: -1 })
    .limit(limit)
    .toArray();

  return docs.map((doc) => ({
    _id: String(doc._id),
    ts: doc.ts ? new Date(doc.ts as Date).toISOString() : new Date(0).toISOString(),
    level: String(doc.level ?? 'info'),
    action: String(doc.action ?? ''),
    source: String(doc.source ?? ''),
    halkaName: doc.halkaName ? String(doc.halkaName) : null,
    blockCode: doc.blockCode ? String(doc.blockCode) : null,
    pageId: doc.pageId ? String(doc.pageId) : null,
    jobId: doc.jobId ? String(doc.jobId) : null,
    correlationId: doc.correlationId ? String(doc.correlationId) : null,
    message: String(doc.message ?? ''),
    details: doc.details ?? null,
    ok: doc.ok !== false,
  }));
}
