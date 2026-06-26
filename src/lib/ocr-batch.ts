import { ObjectId, type Db, type WithId } from 'mongodb';
import type { BlockCodeDocument } from '@/lib/process-page';

export interface OcrBatchFilters {
  halkaName: string;
  blockCode?: string;
  blockCodes?: string[];
  /** Re-process pages that already have ocr_data */
  force?: boolean;
}

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

export function buildOcrClaimQuery(filters: OcrBatchFilters): Record<string, unknown> {
  const query: Record<string, unknown> = {
    halkaName: filters.halkaName,
    url: { $exists: true, $nin: ['', null] },
    status: { $ne: 'processing' },
  };

  if (filters.blockCodes?.length) {
    query.blockCode = { $in: filters.blockCodes };
  } else if (filters.blockCode) {
    query.blockCode = filters.blockCode;
  }

  if (!filters.force) {
    query.$or = [{ ocr_data: { $exists: false } }, { ocr_data: null }];
  }

  return query;
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
