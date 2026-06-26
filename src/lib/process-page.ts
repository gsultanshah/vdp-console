import { ObjectId, type Db, type Document, type WithId } from 'mongodb';
import { runOcrPipeline } from '@/lib/ocr-pipeline';
import { saveOcrDataToBlockcode, saveVotersFromFinalJson } from '@/lib/blockcode-document';

export interface ProcessPageFilters {
  halkaName?: string | null;
  blockCode?: string | null;
  blockCodes?: string[];
  pageId?: string | null;
  includeCompleted?: boolean;
  includeError?: boolean;
  tag?: string | null;
}

export interface BlockCodeDocument extends Document {
  _id: ObjectId;
  blockCode: string;
  fileName: string;
  url: string;
  tag?: string;
  halkaName: string;
  gender?: string;
  religion?: string;
  status: string;
  uploadedAt?: Date;
}

export interface ProcessPageResult {
  saved: number;
  errors: number;
  skippedNoCnic: number;
  duplicates: number;
}

const CLAIMABLE_STATUSES = ['uploaded', 'pending'];

export function parseProcessPageFilters(searchParams: URLSearchParams): ProcessPageFilters {
  const blockCodesParam = searchParams.get('blockCodes');
  const blockCodes = blockCodesParam
    ? blockCodesParam.split(',').map((code) => code.trim()).filter(Boolean)
    : undefined;

  return {
    halkaName: searchParams.get('halkaName'),
    blockCode: searchParams.get('blockCode'),
    blockCodes,
    pageId: searchParams.get('page_id'),
    includeCompleted: searchParams.get('includeCompleted') === 'true',
    includeError: searchParams.get('includeError') !== 'false',
    tag: searchParams.get('tag'),
  };
}

function getClaimableStatuses(filters: ProcessPageFilters): string[] {
  const statuses = [...CLAIMABLE_STATUSES];
  if (filters.includeError) {
    statuses.push('error');
  }
  if (filters.includeCompleted) {
    statuses.push('completed');
  }
  return Array.from(new Set(statuses));
}

/** Query for pages that can still be claimed. Never includes processing or title pages. */
export function buildClaimablePageQuery(filters: ProcessPageFilters): Record<string, unknown> {
  const query: Record<string, unknown> = {
    tag: { $ne: 'title' },
  };

  if (filters.halkaName) {
    query.halkaName = filters.halkaName;
  }

  if (filters.blockCodes?.length) {
    query.blockCode = { $in: filters.blockCodes };
  } else if (filters.blockCode) {
    query.blockCode = filters.blockCode;
  }

  if (filters.tag) {
    if (filters.tag === 'title') {
      throw new Error('Title pages cannot be processed');
    }
    query.tag = filters.tag;
  }

  query.status = { $in: getClaimableStatuses(filters) };

  return query;
}

/**
 * Atomically claim one page by setting status=processing.
 * Safe for parallel workers — each request gets a different page.
 */
export async function claimNextPage(
  db: Db,
  filters: ProcessPageFilters
): Promise<WithId<BlockCodeDocument> | null> {
  if (filters.pageId) {
    if (filters.tag === 'title') {
      throw new Error('Title pages cannot be processed');
    }

    const existing = await db.collection<BlockCodeDocument>('blockcodes').findOne({
      _id: new ObjectId(filters.pageId),
    });

    if (!existing) {
      return null;
    }

    if (existing.tag === 'title') {
      throw new Error('Title pages cannot be processed');
    }

    const result = await db.collection<BlockCodeDocument>('blockcodes').findOneAndUpdate(
      {
        _id: new ObjectId(filters.pageId),
        tag: { $ne: 'title' },
        status: { $in: getClaimableStatuses(filters) },
      },
      {
        $set: {
          status: 'processing',
          processingStartedAt: new Date(),
        },
      },
      { returnDocument: 'after' }
    );

    return result;
  }

  const query = buildClaimablePageQuery(filters);

  const result = await db.collection<BlockCodeDocument>('blockcodes').findOneAndUpdate(
    query,
    {
      $set: {
        status: 'processing',
        processingStartedAt: new Date(),
      },
    },
    {
      sort: { blockCode: 1, fileName: 1, uploadedAt: 1 },
      returnDocument: 'after',
    }
  );

  return result;
}

export async function countRemainingPages(
  db: Db,
  filters: ProcessPageFilters,
  excludePageId?: string
): Promise<number> {
  const query = buildClaimablePageQuery(filters);

  if (excludePageId) {
    query._id = { $ne: new ObjectId(excludePageId) };
  }

  return db.collection('blockcodes').countDocuments(query);
}

export async function processPageDocument(
  document: BlockCodeDocument,
  origin: string,
  db: Db
): Promise<ProcessPageResult> {
  if (document.tag === 'title') {
    throw new Error('Title pages cannot be processed');
  }

  const { ocr_data, finalJson } = await runOcrPipeline(document.url);
  await saveOcrDataToBlockcode(db, document._id, ocr_data);
  return saveVotersFromFinalJson(document, finalJson, origin);
}
