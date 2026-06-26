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

export async function syncTitleLocks(db: Db, filters: MarkTitlePageFilters): Promise<void> {
  const match = buildPageMatch(filters);
  if (!Object.keys(match).length) {
    return;
  }

  const groups = await db
    .collection('blockcodes')
    .aggregate<{ _id: string; halkaName: string; pageCount: number }>([
      { $match: match },
      {
        $group: {
          _id: '$blockCode',
          halkaName: { $first: '$halkaName' },
          pageCount: { $sum: 1 },
        },
      },
    ])
    .toArray();

  for (const group of groups) {
    await db.collection(LOCKS_COLLECTION).updateOne(
      { blockCode: group._id },
      {
        $setOnInsert: {
          blockCode: group._id,
          halkaName: group.halkaName,
          status: 'pending',
          pageCount: group.pageCount,
        },
      },
      { upsert: true }
    );
  }
}

export async function claimNextBlockCode(
  db: Db,
  filters: MarkTitlePageFilters
): Promise<{ blockCode: string; halkaName: string } | null> {
  await syncTitleLocks(db, filters);

  const statuses = claimableStatuses(!!filters.retag);
  const query: Record<string, unknown> = { status: { $in: statuses } };

  if (filters.blockCode) {
    query.blockCode = filters.blockCode;
  } else {
    if (filters.halkaName) query.halkaName = filters.halkaName;
    if (filters.blockCodes?.length) query.blockCode = { $in: filters.blockCodes };
  }

  const lock = await db.collection(LOCKS_COLLECTION).findOneAndUpdate(
    query,
    { $set: { status: 'processing', startedAt: new Date() } },
    { sort: { blockCode: 1 }, returnDocument: 'after' }
  );

  if (!lock) {
    return null;
  }

  return {
    blockCode: lock.blockCode as string,
    halkaName: lock.halkaName as string,
  };
}

export async function countRemainingBlockCodes(
  db: Db,
  filters: MarkTitlePageFilters,
  excludeBlockCode?: string
): Promise<number> {
  await syncTitleLocks(db, filters);

  const query: Record<string, unknown> = {
    status: { $in: claimableStatuses(!!filters.retag) },
  };

  if (filters.blockCode) {
    if (excludeBlockCode && filters.blockCode === excludeBlockCode) {
      return 0;
    }
    query.blockCode = filters.blockCode;
  } else {
    if (filters.halkaName) query.halkaName = filters.halkaName;

    let codes = filters.blockCodes?.length ? [...filters.blockCodes] : undefined;
    if (excludeBlockCode && codes) {
      codes = codes.filter((code) => code !== excludeBlockCode);
    }
    if (codes?.length) {
      query.blockCode = { $in: codes };
    } else if (excludeBlockCode) {
      query.blockCode = { $ne: excludeBlockCode };
    }
  }

  return db.collection(LOCKS_COLLECTION).countDocuments(query);
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

  for (const page of pages) {
    const pageId = page._id.toString();
    const nextTag = titleIdSet.has(pageId) ? 'title' : 'regular';

    if (page.tag !== nextTag) {
      await db.collection('blockcodes').updateOne(
        { _id: page._id },
        { $set: { tag: nextTag } }
      );
    }

    if (nextTag === 'title') {
      titlesUpdated += 1;
    } else {
      regularUpdated += 1;
    }
  }

  const titlePages = pages
    .filter((page) => titleIdSet.has(page._id.toString()))
    .map((page) => ({ id: page._id.toString(), fileName: page.fileName as string }));

  return { titlesUpdated, regularUpdated, titlePages };
}

export async function markBlockCodeTitlePages(
  db: Db,
  blockCode: string
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

  for (const page of pages) {
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
