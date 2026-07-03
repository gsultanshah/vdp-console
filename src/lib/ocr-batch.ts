import { ObjectId, type Db, type WithId } from 'mongodb';
import type { BlockCodeDocument } from '@/lib/process-page';

export interface OcrBatchFilters {
  halkaName: string;
  blockCode?: string;
  blockCodes?: string[];
  /** Re-process pages that already have ocr_data */
  force?: boolean;
  /** Marks pages processed in the current force run so they are not re-claimed */
  forceRunId?: string;
}

const STALE_OCR_CLAIM_MS = 15 * 60 * 1000;

function normalizeHalkaName(name: string): string {
  return name.replace(/\s+/g, '').toUpperCase();
}

export function parseOcrBatchFilters(params: {
  halkaName?: string;
  blockCode?: string;
  blockCodes?: string;
  force?: boolean;
}): OcrBatchFilters {
  const halkaName = normalizeHalkaName(params.halkaName ?? '');
  if (!halkaName) {
    throw new Error('halkaName is required');
  }

  const blockCodes = params.blockCodes
    ? params.blockCodes
        .split(',')
        .map((code) => code.trim())
        .filter(Boolean)
    : undefined;

  return {
    halkaName,
    blockCode: params.blockCode?.trim() || undefined,
    blockCodes: blockCodes?.length ? blockCodes : undefined,
    force: params.force === true,
  };
}

function applyBlockCodeFilter(
  query: Record<string, unknown>,
  filters: OcrBatchFilters
): void {
  if (filters.blockCodes?.length) {
    query.blockCode = { $in: filters.blockCodes };
  } else if (filters.blockCode) {
    query.blockCode = filters.blockCode;
  }
}

export function buildOcrBaseQuery(filters: OcrBatchFilters): Record<string, unknown> {
  const query: Record<string, unknown> = {
    halkaName: filters.halkaName,
    tag: { $ne: 'title' },
    url: { $exists: true, $nin: ['', null] },
  };

  applyBlockCodeFilter(query, filters);
  return query;
}

export function buildOcrClaimQuery(filters: OcrBatchFilters): Record<string, unknown> {
  const query = buildOcrBaseQuery(filters);
  query.status = { $ne: 'processing' };

  if (!filters.force) {
    query.$or = [{ ocr_data: { $exists: false } }, { ocr_data: null }];
  } else if (filters.forceRunId) {
    query.ocrForceRunId = { $ne: filters.forceRunId };
  }

  return query;
}

export async function recoverStaleOcrClaims(
  db: Db,
  filters: OcrBatchFilters
): Promise<number> {
  const staleBefore = new Date(Date.now() - STALE_OCR_CLAIM_MS);
  const query: Record<string, unknown> = {
    halkaName: filters.halkaName,
    status: 'processing',
    processingStartedAt: { $exists: true, $lt: staleBefore },
  };

  applyBlockCodeFilter(query, filters);

  const result = await db.collection('blockcodes').updateMany(query, [
    {
      $set: {
        status: {
          $cond: [
            {
              $and: [
                { $ne: ['$ocrClaimFromStatus', null] },
                { $ne: ['$ocrClaimFromStatus', 'processing'] },
                { $ne: ['$ocrClaimFromStatus', ''] },
              ],
            },
            '$ocrClaimFromStatus',
            'uploaded',
          ],
        },
      },
    },
    { $unset: ['ocrClaimFromStatus', 'processingStartedAt'] },
  ]);

  return result.modifiedCount;
}

export async function releaseAllOcrClaims(
  db: Db,
  filters: OcrBatchFilters
): Promise<number> {
  const query: Record<string, unknown> = {
    halkaName: filters.halkaName,
    status: 'processing',
    ocrClaimFromStatus: { $exists: true },
  };

  applyBlockCodeFilter(query, filters);

  const result = await db.collection('blockcodes').updateMany(query, [
    {
      $set: {
        status: {
          $cond: [
            {
              $and: [
                { $ne: ['$ocrClaimFromStatus', null] },
                { $ne: ['$ocrClaimFromStatus', 'processing'] },
                { $ne: ['$ocrClaimFromStatus', ''] },
              ],
            },
            '$ocrClaimFromStatus',
            'uploaded',
          ],
        },
      },
    },
    { $unset: ['ocrClaimFromStatus', 'processingStartedAt'] },
  ]);

  return result.modifiedCount;
}

/**
 * Atomically claim one page for OCR batch processing.
 * Stores the previous status in ocrClaimFromStatus so it can be restored after OCR.
 */
export async function claimNextOcrPage(
  db: Db,
  filters: OcrBatchFilters
): Promise<WithId<BlockCodeDocument & { ocrClaimFromStatus?: string }> | null> {
  const query = buildOcrClaimQuery(filters);

  const result = await db.collection<BlockCodeDocument>('blockcodes').findOneAndUpdate(
    query,
    [
      {
        $set: {
          ocrClaimFromStatus: '$status',
          status: 'processing',
          processingStartedAt: new Date(),
        },
      },
    ],
    {
      sort: { blockCode: 1, fileName: 1, uploadedAt: 1 },
      returnDocument: 'after',
    }
  );

  return result;
}

export async function countRemainingOcrPages(
  db: Db,
  filters: OcrBatchFilters,
  excludePageId?: string
): Promise<number> {
  const query = buildOcrClaimQuery(filters);

  if (excludePageId) {
    query._id = { $ne: new ObjectId(excludePageId) };
  }

  return db.collection('blockcodes').countDocuments(query);
}

export async function countOcrPageStats(
  db: Db,
  filters: OcrBatchFilters
): Promise<{ pendingWithoutOcr: number; withOcr: number; inProcessing: number; totalEligible: number }> {
  const base = buildOcrBaseQuery(filters);

  const [pendingWithoutOcr, withOcr, inProcessing, totalEligible] = await Promise.all([
    db.collection('blockcodes').countDocuments({
      ...base,
      status: { $ne: 'processing' },
      $or: [{ ocr_data: { $exists: false } }, { ocr_data: null }],
    }),
    db.collection('blockcodes').countDocuments({
      ...base,
      ocr_data: { $exists: true, $ne: null },
    }),
    db.collection('blockcodes').countDocuments({
      ...base,
      status: 'processing',
    }),
    db.collection('blockcodes').countDocuments({
      ...base,
      status: { $ne: 'processing' },
    }),
  ]);

  return { pendingWithoutOcr, withOcr, inProcessing, totalEligible };
}

export async function countDuplicateOcrPages(
  db: Db,
  filters: OcrBatchFilters
): Promise<number> {
  const rows = await db
    .collection('blockcodes')
    .aggregate<{ count: number }>([
      { $match: buildOcrBaseQuery(filters) },
      {
        $group: {
          _id: { blockCode: '$blockCode', fileName: '$fileName' },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $count: 'count' },
    ])
    .toArray();

  return rows[0]?.count ?? 0;
}
