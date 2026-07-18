import { ObjectId, type Db } from 'mongodb';
import { connectNativeMongoClient } from '@/lib/mongo-client';
import { createParchiJob, getParchiJob, processParchiBatch } from '@/lib/voter-parchi/job-service';
import { getLatestParchi } from '@/lib/voter-parchi/latest-store';
import { isBlockCodeDeleted } from '@/lib/blockcode-soft-delete';

function normalizeHalka(halkaName: string): string {
  return halkaName.replace(/\s+/g, '').toUpperCase();
}

export interface ParchiCandidate {
  blockCode: string;
  reason: 'verified' | 'requested' | 'stale';
  voterCount: number;
  fingerprint: string;
  latestVoterCount: number | null;
}

async function voterFingerprint(db: Db, halkaName: string, blockCode: string): Promise<{
  count: number;
  fingerprint: string;
}> {
  const halka = normalizeHalka(halkaName);
  const match = { halkaName: halka, blockCode };
  const [count, newest] = await Promise.all([
    db.collection('voters').countDocuments(match),
    db
      .collection('voters')
      .find(match)
      .project({ updatedAt: 1, _id: 1 })
      .sort({ updatedAt: -1, _id: -1 })
      .limit(1)
      .toArray(),
  ]);
  const tip = newest[0];
  const tipId = tip?._id ? String(tip._id) : 'none';
  const tipUpdated = tip?.updatedAt ? new Date(tip.updatedAt as Date).toISOString() : 'none';
  return {
    count,
    fingerprint: `${count}:${tipId}:${tipUpdated}`,
  };
}

/**
 * Blocks that need (re)generation:
 * - work status verified, OR requestParchiGeneration=true
 * - and no latest PDF, or latest voterCount / fingerprint stale
 */
export async function listParchiCandidates(halkaName: string): Promise<ParchiCandidate[]> {
  const client = await connectNativeMongoClient();
  const db = client.db('vdp');
  const halka = normalizeHalka(halkaName);

  const constituency = await db.collection('constituencies').findOne({
    halkaName: halka,
    deletedAt: null,
  });
  if (!constituency) return [];

  const activeCodes: string[] = Array.isArray(constituency.blockCodes)
    ? constituency.blockCodes.map(String)
    : [];
  const deleted = constituency.deletedBlockCodes;

  const progressDocs = await db
    .collection('blockcodeworkprogress')
    .find({
      halkaName: halka,
      $or: [{ status: 'verified' }, { requestParchiGeneration: true }],
    })
    .project({ blockCode: 1, status: 1, requestParchiGeneration: 1, parchiFingerprint: 1 })
    .toArray();

  const items: ParchiCandidate[] = [];

  for (const doc of progressDocs) {
    const blockCode = String(doc.blockCode ?? '');
    if (!blockCode || !activeCodes.includes(blockCode)) continue;
    if (isBlockCodeDeleted(deleted, blockCode)) continue;

    const { count, fingerprint } = await voterFingerprint(db, halka, blockCode);
    if (count === 0) continue;

    const latest = await getLatestParchi(halka, blockCode);
    const storedFp = doc.parchiFingerprint ? String(doc.parchiFingerprint) : null;
    const isFresh =
      latest &&
      latest.voterCount === count &&
      storedFp === fingerprint;

    if (isFresh) continue;

    // Skip if a running automator job already covers this block
    const running = await db.collection('voter_parchi_jobs').findOne({
      halkaName: halka,
      blockCodes: blockCode,
      status: { $in: ['pending', 'running'] },
      createdBy: 'vdp-automator',
    });
    if (running) continue;

    let reason: ParchiCandidate['reason'] = 'stale';
    if (doc.requestParchiGeneration) reason = 'requested';
    else if (doc.status === 'verified') reason = 'verified';

    items.push({
      blockCode,
      reason,
      voterCount: count,
      fingerprint,
      latestVoterCount: latest?.voterCount ?? null,
    });
  }

  return items;
}

export async function ensureAutomationParchiJob(input: {
  halkaName: string;
  blockCode: string;
  fingerprint?: string;
}): Promise<{ jobId: string; created: boolean; status: string }> {
  const client = await connectNativeMongoClient();
  const db = client.db('vdp');
  const halka = normalizeHalka(input.halkaName);
  const blockCode = String(input.blockCode).trim();

  const existing = await db.collection('voter_parchi_jobs').findOne({
    halkaName: halka,
    blockCodes: blockCode,
    status: { $in: ['pending', 'running'] },
    createdBy: 'vdp-automator',
  });

  if (existing) {
    return {
      jobId: String(existing._id),
      created: false,
      status: String(existing.status),
    };
  }

  const defaultDesign = await db.collection('voter_parchi_designs').findOne({
    halkaName: halka,
    isDefault: true,
  });
  const anyDesign =
    defaultDesign ||
    (await db.collection('voter_parchi_designs').findOne({ halkaName: halka }, { sort: { createdAt: -1 } }));

  if (!anyDesign?._id) {
    throw new Error(`No voter parchi design for ${halka}`);
  }

  const job = await createParchiJob({
    halkaName: halka,
    designId: String(anyDesign._id),
    blockCodes: [blockCode],
    selectAllBlockCodes: false,
    genderFilter: 'both',
    createdBy: 'vdp-automator',
    createdByName: 'VDP Automator',
    skipRowCrops: true,
  });

  const jobId = String(job._id ?? '');
  if (!jobId) {
    throw new Error('Parchi job created without id');
  }

  if (input.fingerprint) {
    await db.collection('blockcodeworkprogress').updateOne(
      { halkaName: halka, blockCode },
      {
        $set: {
          parchiJobId: jobId,
          parchiFingerprintPending: input.fingerprint,
          updatedAt: new Date(),
        },
      }
    );
  }

  return { jobId, created: true, status: job.status };
}

export async function processAutomationParchiBatch(jobId: string) {
  const job = await processParchiBatch(jobId);
  if (!job) return null;

  if (job.status === 'completed' && !job.selectAllBlockCodes && job.blockCodes.length === 1) {
    const client = await connectNativeMongoClient();
    const db = client.db('vdp');
    const blockCode = job.blockCodes[0];
    const progress = await db.collection('blockcodeworkprogress').findOne({
      halkaName: job.halkaName,
      blockCode,
    });
    const fingerprint = progress?.parchiFingerprintPending
      ? String(progress.parchiFingerprintPending)
      : null;

    await db.collection('blockcodeworkprogress').updateOne(
      { halkaName: job.halkaName, blockCode },
      {
        $set: {
          requestParchiGeneration: false,
          ...(fingerprint ? { parchiFingerprint: fingerprint } : {}),
          parchiJobId: jobId,
          parchiCompletedAt: new Date(),
        },
        $unset: { parchiFingerprintPending: '' },
      }
    );
  }

  return job;
}

export async function getAutomationJob(jobId: string) {
  if (!ObjectId.isValid(jobId)) return null;
  return getParchiJob(jobId);
}
