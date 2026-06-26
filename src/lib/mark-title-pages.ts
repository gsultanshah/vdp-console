import { type Db } from 'mongodb';
import { extractTextFromImageUrl } from '@/lib/ocr-text';
import {
  MAX_TITLE_PAGES,
  pickTitlePageIds,
  scoreTitlePage,
} from '@/lib/title-page-detection';

export interface MarkTitlePageFilters {
  halkaName?: string | null;
  blockCode?: string | null;
  blockCodes?: string[];
  retag?: boolean;
}

export interface MarkTitlePageResult {
  blockCode: string;
  halkaName: string;
  pagesScored: number;
  titlesUpdated: number;
  regularUpdated: number;
  titlePages: { id: string; fileName: string; score: number }[];
}

const LOCKS_COLLECTION = 'blockcode_title_locks';

export function parseMarkTitlePageFilters(searchParams: URLSearchParams): MarkTitlePageFilters {
  const blockCodesParam = searchParams.get('blockCodes');
  const blockCodes = blockCodesParam
    ? blockCodesParam.split(',').map((code) => code.trim()).filter(Boolean)
    : undefined;

  return {
    halkaName: searchParams.get('halkaName'),
    blockCode: searchParams.get('blockCode'),
    blockCodes,
    retag: searchParams.get('retag') === 'true',
  };
}

function claimableStatuses(retag: boolean): string[] {
  return retag ? ['pending', 'error', 'done'] : ['pending', 'error'];
}

function buildPageMatch(filters: MarkTitlePageFilters): Record<string, unknown> {
  const match: Record<string, unknown> = {};
  if (filters.halkaName) match.halkaName = filters.halkaName;
  if (filters.blockCodes?.length) {
    match.blockCode = { $in: filters.blockCodes };
  } else if (filters.blockCode) {
    match.blockCode = filters.blockCode;
  }
  return match;
}

function lockStatusExpression(retag: boolean) {
  return {
    $let: {
      vars: {
        s: {
          $cond: [
            { $eq: [{ $size: '$lock' }, 0] },
            'pending',
            { $arrayElemAt: ['$lock.status', 0] },
          ],
        },
      },
      in: retag
        ? {
            $and: [
              { $ne: ['$$s', 'processing'] },
              { $in: ['$$s', ['pending', 'error', 'done']] },
            ],
          }
        : { $in: ['$$s', ['pending', 'error']] },
    },
  };
}

function candidateBlockCodesPipeline(
  filters: MarkTitlePageFilters,
  limit?: number
): Record<string, unknown>[] {
  const match = buildPageMatch(filters);
  const pipeline: Record<string, unknown>[] = [
    { $match: match },
    { $group: { _id: '$blockCode', halkaName: { $first: '$halkaName' } } },
    {
      $lookup: {
        from: LOCKS_COLLECTION,
        localField: '_id',
        foreignField: 'blockCode',
        as: 'lock',
      },
    },
    { $match: { $expr: lockStatusExpression(!!filters.retag) } },
    { $sort: { _id: 1 } },
  ];

  if (limit) {
    pipeline.push({ $limit: limit });
  }

  return pipeline;
}

/** Claim next block code without syncing thousands of lock rows up front. */
export async function claimNextBlockCode(
  db: Db,
  filters: MarkTitlePageFilters
): Promise<{ blockCode: string; halkaName: string } | null> {
  const statuses = claimableStatuses(!!filters.retag);

  const lockQuery: Record<string, unknown> = { status: { $in: statuses } };
  if (filters.blockCode) {
    lockQuery.blockCode = filters.blockCode;
  } else {
    if (filters.halkaName) lockQuery.halkaName = filters.halkaName;
    if (filters.blockCodes?.length) lockQuery.blockCode = { $in: filters.blockCodes };
  }

  const existing = await db.collection(LOCKS_COLLECTION).findOneAndUpdate(
    lockQuery,
    { $set: { status: 'processing', startedAt: new Date() } },
    { sort: { blockCode: 1 }, returnDocument: 'after' }
  );

  if (existing) {
    return {
      blockCode: existing.blockCode as string,
      halkaName: existing.halkaName as string,
    };
  }

  const candidate = await db
    .collection('blockcodes')
    .aggregate<{ _id: string; halkaName: string }>(candidateBlockCodesPipeline(filters, 1))
    .next();

  if (!candidate) {
    return null;
  }

  const blockedStatuses = filters.retag ? ['processing'] : ['done', 'processing'];

  const claimed = await db.collection(LOCKS_COLLECTION).findOneAndUpdate(
    {
      blockCode: candidate._id,
      status: { $nin: blockedStatuses },
    },
    {
      $set: {
        status: 'processing',
        startedAt: new Date(),
        halkaName: candidate.halkaName,
        blockCode: candidate._id,
      },
    },
    { upsert: true, returnDocument: 'after' }
  );

  if (!claimed || claimed.status !== 'processing') {
    return null;
  }

  return {
    blockCode: claimed.blockCode as string,
    halkaName: claimed.halkaName as string,
  };
}

export async function countRemainingBlockCodes(
  db: Db,
  filters: MarkTitlePageFilters,
  excludeBlockCode?: string
): Promise<number> {
  const pipeline = candidateBlockCodesPipeline(filters);
  if (excludeBlockCode) {
    pipeline.splice(pipeline.length - 1, 0, {
      $match: { _id: { $ne: excludeBlockCode } },
    });
  }
  pipeline.push({ $count: 'total' });

  const result = await db
    .collection('blockcodes')
    .aggregate<{ total: number }>(pipeline)
    .next();

  return result?.total ?? 0;
}

export async function applyTagsForBlockCode(
  db: Db,
  blockCode: string,
  titlePageIds: string[]
): Promise<{ titlesUpdated: number; regularUpdated: number; titlePages: { id: string; fileName: string }[] }> {
  const pages = await db
    .collection('blockcodes')
    .find({ blockCode })
    .project({ _id: 1, fileName: 1, tag: 1 })
    .toArray();

  if (!pages.length) {
    throw new Error('No pages found for block code');
  }

  const validPageIds = new Set(pages.map((page) => page._id.toString()));
  const titleIdSet = new Set(
    titlePageIds.filter((id) => validPageIds.has(id)).slice(0, MAX_TITLE_PAGES)
  );

  let titlesUpdated = 0;
  let regularUpdated = 0;
  const bulkOps = [];

  for (const page of pages) {
    const pageId = page._id.toString();
    const nextTag = titleIdSet.has(pageId) ? 'title' : 'regular';

    if (page.tag !== nextTag) {
      bulkOps.push({
        updateOne: {
          filter: { _id: page._id },
          update: { $set: { tag: nextTag } },
        },
      });
    }

    if (nextTag === 'title') {
      titlesUpdated += 1;
    } else {
      regularUpdated += 1;
    }
  }

  if (bulkOps.length) {
    await db.collection('blockcodes').bulkWrite(bulkOps);
  }

  const titlePages = pages
    .filter((page) => titleIdSet.has(page._id.toString()))
    .map((page) => ({ id: page._id.toString(), fileName: page.fileName as string }));

  return { titlesUpdated, regularUpdated, titlePages };
}

export async function markBlockCodeTitlePages(
  db: Db,
  blockCode: string,
  onPageScored?: (info: { index: number; total: number; fileName: string }) => void
): Promise<MarkTitlePageResult> {
  const pages = await db
    .collection('blockcodes')
    .find({ blockCode })
    .sort({ fileName: 1, uploadedAt: 1 })
    .toArray();

  if (!pages.length) {
    throw new Error('No pages found for block code');
  }

  const scoredPages: { id: string; score: number; fileName: string }[] = [];

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    onPageScored?.({
      index: i + 1,
      total: pages.length,
      fileName: page.fileName as string,
    });

    const ocrText = await extractTextFromImageUrl(page.url as string);
    scoredPages.push({
      id: page._id.toString(),
      score: scoreTitlePage(ocrText, page.fileName as string),
      fileName: page.fileName as string,
    });
  }

  const titlePageIds = pickTitlePageIds(scoredPages);
  const { titlesUpdated, regularUpdated, titlePages } = await applyTagsForBlockCode(
    db,
    blockCode,
    titlePageIds
  );

  const scoreById = new Map(scoredPages.map((page) => [page.id, page.score]));

  return {
    blockCode,
    halkaName: pages[0].halkaName as string,
    pagesScored: scoredPages.length,
    titlesUpdated,
    regularUpdated,
    titlePages: titlePages.map((page) => ({
      ...page,
      score: scoreById.get(page.id) ?? 0,
    })),
  };
}

export async function setBlockCodeLockStatus(
  db: Db,
  blockCode: string,
  status: 'done' | 'error' | 'pending'
): Promise<void> {
  await db.collection(LOCKS_COLLECTION).updateOne(
    { blockCode },
    {
      $set: {
        status,
        ...(status === 'done' ? { completedAt: new Date() } : {}),
      },
    }
  );
}

export async function resetStuckTitleLocks(db: Db): Promise<number> {
  const result = await db.collection(LOCKS_COLLECTION).updateMany(
    { status: 'processing' },
    { $set: { status: 'pending' } }
  );
  return result.modifiedCount;
}
