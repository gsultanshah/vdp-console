import { ObjectId, type Db, type WithId } from 'mongodb';
import type { OcrDataPayload } from '@/lib/ocr-types';
import type { BlockCodeDocument } from '@/lib/process-page';
import {
  enrichExistingVotersFromOcrData,
  persistedEnrichStats,
  type VoterEnrichPageResult,
} from '@/lib/voter-document';

export type { VoterEnrichPageResult } from '@/lib/voter-document';

export interface VoterEnrichBatchFilters {
  halkaName: string;
  blockCode?: string;
  blockCodes?: string[];
  /** Re-enrich pages that already have voterEnrichAt */
  force?: boolean;
}

export type EnrichBlockcodeDocument = BlockCodeDocument & {
  ocr_data?: OcrDataPayload | null;
  voterEnrichAt?: Date;
  voterEnrichClaimedAt?: Date;
  voterEnrichStats?: VoterEnrichPageResult;
};

const STALE_CLAIM_MS = 2 * 60 * 1000;

export function isMongoTimeoutError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('time limit') ||
    message.includes('MaxTimeMS') ||
    message.includes('maxTimeMS')
  );
}

function normalizeHalkaName(name: string): string {
  return name.replace(/\s+/g, '').toUpperCase();
}

export function parseVoterEnrichBatchFilters(params: {
  halkaName?: string;
  blockCode?: string;
  blockCodes?: string;
  force?: boolean;
}): VoterEnrichBatchFilters {
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

export function buildEnrichClaimQuery(filters: VoterEnrichBatchFilters): Record<string, unknown> {
  const query: Record<string, unknown> = {
    halkaName: filters.halkaName,
    tag: 'regular',
    ocr_data: { $exists: true, $ne: null },
    voterEnrichClaimedAt: { $exists: false },
  };

  if (filters.blockCodes?.length) {
    query.blockCode = { $in: filters.blockCodes };
  } else if (filters.blockCode) {
    query.blockCode = filters.blockCode;
  }

  if (!filters.force) {
    query.voterEnrichAt = { $exists: false };
  }

  return query;
}

export async function recoverStaleEnrichClaims(
  db: Db,
  filters: VoterEnrichBatchFilters
): Promise<number> {
  const staleBefore = new Date(Date.now() - STALE_CLAIM_MS);
  const query: Record<string, unknown> = {
    halkaName: filters.halkaName,
    tag: 'regular',
    voterEnrichClaimedAt: { $exists: true, $lt: staleBefore },
    voterEnrichAt: { $exists: false },
  };

  if (filters.blockCodes?.length) {
    query.blockCode = { $in: filters.blockCodes };
  } else if (filters.blockCode) {
    query.blockCode = filters.blockCode;
  }

  const result = await db.collection('blockcodes').updateMany(
    query,
    { $unset: { voterEnrichClaimedAt: '' } },
    { maxTimeMS: 120_000 }
  );

  return result.modifiedCount;
}

export async function releaseAllEnrichClaims(
  db: Db,
  filters: VoterEnrichBatchFilters
): Promise<number> {
  const query: Record<string, unknown> = {
    halkaName: filters.halkaName,
    tag: 'regular',
    voterEnrichClaimedAt: { $exists: true },
    voterEnrichAt: { $exists: false },
  };

  if (filters.blockCodes?.length) {
    query.blockCode = { $in: filters.blockCodes };
  } else if (filters.blockCode) {
    query.blockCode = filters.blockCode;
  }

  const result = await db.collection('blockcodes').updateMany(
    query,
    { $unset: { voterEnrichClaimedAt: '' } },
    { maxTimeMS: 120_000 }
  );

  return result.modifiedCount;
}

export async function claimNextEnrichPage(
  db: Db,
  filters: VoterEnrichBatchFilters
): Promise<WithId<EnrichBlockcodeDocument> | null> {
  const query = buildEnrichClaimQuery(filters);
  const collection = db.collection<EnrichBlockcodeDocument>('blockcodes');
  const updateOptions = {
    sort: { blockCode: 1, fileName: 1, uploadedAt: 1 } as const,
    returnDocument: 'after' as const,
  };

  try {
    return await collection.findOneAndUpdate(
      query,
      { $set: { voterEnrichClaimedAt: new Date() } },
      {
        ...updateOptions,
        hint: {
          halkaName: 1,
          tag: 1,
          voterEnrichAt: 1,
          voterEnrichClaimedAt: 1,
          blockCode: 1,
          fileName: 1,
        },
      }
    );
  } catch (error) {
    if (!isMongoTimeoutError(error)) {
      try {
        return await collection.findOneAndUpdate(
          query,
          { $set: { voterEnrichClaimedAt: new Date() } },
          updateOptions
        );
      } catch {
        throw error;
      }
    }
    throw error;
  }
}

export async function countRemainingEnrichPages(
  db: Db,
  filters: VoterEnrichBatchFilters
): Promise<number | null> {
  try {
    return await db.collection('blockcodes').countDocuments(buildEnrichClaimQuery(filters), {
      maxTimeMS: 600_000,
    });
  } catch (error) {
    if (isMongoTimeoutError(error)) {
      return null;
    }
    throw error;
  }
}

export async function ensureEnrichIndexes(db: Db): Promise<void> {
  const collection = db.collection('blockcodes');
  const indexes = await collection.indexes();
  const queueIndexName = 'enrich_queue_v2';
  const claimedIndexName = 'enrich_claimed_v1';

  if (!indexes.some((idx) => idx.name === queueIndexName)) {
    console.log('\nBuilding enrich queue index (one-time, workers start meanwhile)...');
    await collection.createIndex(
      {
        halkaName: 1,
        tag: 1,
        voterEnrichAt: 1,
        voterEnrichClaimedAt: 1,
        blockCode: 1,
        fileName: 1,
      },
      {
        name: queueIndexName,
        partialFilterExpression: {
          tag: 'regular',
          ocr_data: { $exists: true },
        },
      }
    );
  }

  if (!indexes.some((idx) => idx.name === claimedIndexName)) {
    await collection.createIndex(
      { halkaName: 1, tag: 1, voterEnrichClaimedAt: 1 },
      {
        background: true,
        name: claimedIndexName,
        partialFilterExpression: {
          tag: 'regular',
          voterEnrichClaimedAt: { $exists: true },
        },
      }
    );
  }
}

export async function processEnrichForClaimedPage(
  db: Db,
  document: EnrichBlockcodeDocument
): Promise<VoterEnrichPageResult> {
  if (!document.ocr_data) {
    throw new Error(`Page ${document.blockCode}/${document.fileName} has no ocr_data`);
  }

  const stats = await enrichExistingVotersFromOcrData(db, document, document.ocr_data);

  await db.collection('blockcodes').updateOne(
    { _id: document._id },
    {
      $set: {
        voterEnrichAt: new Date(),
        voterEnrichStats: persistedEnrichStats(stats),
      },
      $unset: {
        voterEnrichClaimedAt: '',
      },
    }
  );

  return stats;
}

export async function releaseEnrichClaim(db: Db, pageId: ObjectId): Promise<void> {
  await db.collection('blockcodes').updateOne(
    { _id: pageId },
    { $unset: { voterEnrichClaimedAt: '' } }
  );
}
