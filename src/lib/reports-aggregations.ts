import type { Db } from 'mongodb';
import { BLOCK_WORK_STATUSES, emptyStatusCounts } from '@/lib/block-work-progress';
import type {
  ReportsBlockCodeRow,
  ReportsConstituencyRow,
  ReportsPageStats,
  ReportsVoterStats,
} from '@/lib/reports-types';

const MALE_LAST_DIGITS = ['1', '3', '5', '7', '9'];
const FEMALE_LAST_DIGITS = ['0', '2', '4', '6', '8'];

function cnicDigitsExpression(fieldPath = '$cnic') {
  return {
    $reduce: {
      input: { $range: [0, { $strLenCP: { $ifNull: [fieldPath, ''] } }] },
      initialValue: '',
      in: {
        $let: {
          vars: { ch: { $substrCP: [fieldPath, '$$this', 1] } },
          in: {
            $cond: {
              if: { $regexMatch: { input: '$$ch', regex: /[0-9]/ } },
              then: { $concat: ['$$value', '$$ch'] },
              else: '$$value',
            },
          },
        },
      },
    },
  };
}

function emptyPageStats(): ReportsPageStats {
  return { total: 0, completed: 0, processing: 0, error: 0, uploaded: 0, pending: 0 };
}

function tallyPageStats(byStatus: Record<string, number>): ReportsPageStats {
  const total = Object.values(byStatus).reduce((sum, value) => sum + value, 0);
  const completed = byStatus.completed ?? 0;
  const processing = byStatus.processing ?? 0;
  const error = byStatus.error ?? 0;
  const pending = (byStatus.pending ?? 0) + (byStatus.failed ?? 0);
  const uploaded =
    (byStatus.uploaded ?? 0) + completed + processing + error;

  return { total, completed, processing, error, uploaded, pending };
}

export async function aggregateGlobalVoterStats(
  db: Db,
  halkaFilter: Record<string, unknown>
): Promise<ReportsVoterStats> {
  const rows = await db
    .collection('voters')
    .aggregate(
      [
        {
          $match: {
            ...halkaFilter,
            cnic: { $type: 'string', $nin: ['', null] },
          },
        },
        { $project: { cnicNorm: cnicDigitsExpression() } },
        { $match: { cnicNorm: { $ne: '' } } },
        { $group: { _id: '$cnicNorm' } },
        {
          $project: {
            lastDigit: {
              $substrCP: ['$_id', { $subtract: [{ $strLenCP: '$_id' }, 1] }, 1],
            },
          },
        },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            male: { $sum: { $cond: [{ $in: ['$lastDigit', MALE_LAST_DIGITS] }, 1, 0] } },
            female: { $sum: { $cond: [{ $in: ['$lastDigit', FEMALE_LAST_DIGITS] }, 1, 0] } },
          },
        },
      ],
      { allowDiskUse: true }
    )
    .toArray();

  const result = rows[0] as { count?: number; male?: number; female?: number } | undefined;
  return {
    count: result?.count ?? 0,
    male: result?.male ?? 0,
    female: result?.female ?? 0,
  };
}

export async function aggregateVotersByHalka(
  db: Db,
  halkaFilter: Record<string, unknown>
): Promise<Map<string, ReportsVoterStats>> {
  const rows = await db
    .collection('voters')
    .aggregate(
      [
        {
          $match: {
            ...halkaFilter,
            cnic: { $type: 'string', $nin: ['', null] },
          },
        },
        {
          $project: {
            halkaName: 1,
            cnicNorm: cnicDigitsExpression(),
          },
        },
        { $match: { cnicNorm: { $ne: '' } } },
        {
          $group: {
            _id: { halkaName: '$halkaName', cnic: '$cnicNorm' },
          },
        },
        {
          $project: {
            halkaName: '$_id.halkaName',
            lastDigit: {
              $substrCP: ['$_id.cnic', { $subtract: [{ $strLenCP: '$_id.cnic' }, 1] }, 1],
            },
          },
        },
        {
          $group: {
            _id: '$halkaName',
            count: { $sum: 1 },
            male: { $sum: { $cond: [{ $in: ['$lastDigit', MALE_LAST_DIGITS] }, 1, 0] } },
            female: { $sum: { $cond: [{ $in: ['$lastDigit', FEMALE_LAST_DIGITS] }, 1, 0] } },
          },
        },
      ],
      { allowDiskUse: true }
    )
    .toArray();

  const map = new Map<string, ReportsVoterStats>();
  for (const row of rows) {
    map.set(String(row._id), {
      count: row.count ?? 0,
      male: row.male ?? 0,
      female: row.female ?? 0,
    });
  }
  return map;
}

export async function aggregatePagesByHalkaStatus(
  db: Db,
  halkaFilter: Record<string, unknown>
): Promise<Map<string, { byStatus: Record<string, number>; byTag: Record<string, number> }>> {
  const matchStage = Object.keys(halkaFilter).length > 0 ? { $match: halkaFilter } : { $match: {} };

  const [statusRows, tagRows] = await Promise.all([
    db
      .collection('blockcodes')
      .aggregate([
        matchStage,
        {
          $group: {
            _id: { halkaName: '$halkaName', status: '$status' },
            count: { $sum: 1 },
          },
        },
      ])
      .toArray(),
    db
      .collection('blockcodes')
      .aggregate([
        matchStage,
        {
          $group: {
            _id: { halkaName: '$halkaName', tag: '$tag' },
            count: { $sum: 1 },
          },
        },
      ])
      .toArray(),
  ]);

  const map = new Map<string, { byStatus: Record<string, number>; byTag: Record<string, number> }>();

  for (const row of statusRows) {
    const halkaName = String(row._id?.halkaName ?? '');
    const status = String(row._id?.status ?? 'unknown');
    const entry = map.get(halkaName) ?? { byStatus: {}, byTag: {} };
    entry.byStatus[status] = (entry.byStatus[status] ?? 0) + (row.count ?? 0);
    map.set(halkaName, entry);
  }

  for (const row of tagRows) {
    const halkaName = String(row._id?.halkaName ?? '');
    const tag = String(row._id?.tag ?? 'unknown');
    const entry = map.get(halkaName) ?? { byStatus: {}, byTag: {} };
    entry.byTag[tag] = (entry.byTag[tag] ?? 0) + (row.count ?? 0);
    map.set(halkaName, entry);
  }

  return map;
}

export async function aggregateGlobalPages(
  db: Db,
  halkaFilter: Record<string, unknown>
): Promise<{ byStatus: Record<string, number>; byTag: Record<string, number> }> {
  const matchStage = Object.keys(halkaFilter).length > 0 ? { $match: halkaFilter } : { $match: {} };

  const [statusRows, tagRows] = await Promise.all([
    db
      .collection('blockcodes')
      .aggregate([matchStage, { $group: { _id: '$status', count: { $sum: 1 } } }])
      .toArray(),
    db
      .collection('blockcodes')
      .aggregate([matchStage, { $group: { _id: '$tag', count: { $sum: 1 } } }])
      .toArray(),
  ]);

  const byStatus: Record<string, number> = {};
  for (const row of statusRows) {
    byStatus[String(row._id ?? 'unknown')] = row.count ?? 0;
  }

  const byTag: Record<string, number> = {};
  for (const row of tagRows) {
    byTag[String(row._id ?? 'unknown')] = row.count ?? 0;
  }

  return { byStatus, byTag };
}

export async function aggregateBlockCodePages(
  db: Db,
  halkaFilter: Record<string, unknown>
): Promise<
  Map<
    string,
    {
      halkaName: string;
      blockCode: string;
      pages: number;
      pagesCompleted: number;
      pagesProcessing: number;
      pagesError: number;
      pageTags: Record<string, number>;
    }
  >
> {
  const matchStage = Object.keys(halkaFilter).length > 0 ? { $match: halkaFilter } : { $match: {} };

  const [pageRows, tagRows] = await Promise.all([
    db
      .collection('blockcodes')
      .aggregate([
        matchStage,
        {
          $group: {
            _id: { halkaName: '$halkaName', blockCode: '$blockCode' },
            pages: { $sum: 1 },
            pagesCompleted: {
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
            },
            pagesProcessing: {
              $sum: { $cond: [{ $eq: ['$status', 'processing'] }, 1, 0] },
            },
            pagesError: {
              $sum: { $cond: [{ $eq: ['$status', 'error'] }, 1, 0] },
            },
          },
        },
      ])
      .toArray(),
    db
      .collection('blockcodes')
      .aggregate([
        matchStage,
        {
          $group: {
            _id: { halkaName: '$halkaName', blockCode: '$blockCode', tag: '$tag' },
            count: { $sum: 1 },
          },
        },
      ])
      .toArray(),
  ]);

  const map = new Map<
    string,
    {
      halkaName: string;
      blockCode: string;
      pages: number;
      pagesCompleted: number;
      pagesProcessing: number;
      pagesError: number;
      pageTags: Record<string, number>;
    }
  >();

  for (const row of pageRows) {
    const halkaName = String(row._id?.halkaName ?? '');
    const blockCode = String(row._id?.blockCode ?? '');
    const key = `${halkaName}::${blockCode}`;
    map.set(key, {
      halkaName,
      blockCode,
      pages: row.pages ?? 0,
      pagesCompleted: row.pagesCompleted ?? 0,
      pagesProcessing: row.pagesProcessing ?? 0,
      pagesError: row.pagesError ?? 0,
      pageTags: {},
    });
  }

  for (const row of tagRows) {
    const halkaName = String(row._id?.halkaName ?? '');
    const blockCode = String(row._id?.blockCode ?? '');
    const tag = String(row._id?.tag ?? 'unknown');
    const key = `${halkaName}::${blockCode}`;
    const entry = map.get(key) ?? {
      halkaName,
      blockCode,
      pages: 0,
      pagesCompleted: 0,
      pagesProcessing: 0,
      pagesError: 0,
      pageTags: {},
    };
    entry.pageTags[tag] = (entry.pageTags[tag] ?? 0) + (row.count ?? 0);
    map.set(key, entry);
  }

  return map;
}

export async function aggregateVotersByBlock(
  db: Db,
  halkaFilter: Record<string, unknown>
): Promise<Map<string, ReportsVoterStats & { halkaName: string; blockCode: string }>> {
  const rows = await db
    .collection('voters')
    .aggregate(
      [
        {
          $match: {
            ...halkaFilter,
            cnic: { $type: 'string', $nin: ['', null] },
          },
        },
        {
          $project: {
            halkaName: 1,
            blockCode: 1,
            cnicNorm: cnicDigitsExpression(),
          },
        },
        { $match: { cnicNorm: { $ne: '' } } },
        {
          $group: {
            _id: { halkaName: '$halkaName', blockCode: '$blockCode', cnic: '$cnicNorm' },
          },
        },
        {
          $project: {
            halkaName: '$_id.halkaName',
            blockCode: '$_id.blockCode',
            lastDigit: {
              $substrCP: ['$_id.cnic', { $subtract: [{ $strLenCP: '$_id.cnic' }, 1] }, 1],
            },
          },
        },
        {
          $group: {
            _id: { halkaName: '$halkaName', blockCode: '$blockCode' },
            count: { $sum: 1 },
            male: { $sum: { $cond: [{ $in: ['$lastDigit', MALE_LAST_DIGITS] }, 1, 0] } },
            female: { $sum: { $cond: [{ $in: ['$lastDigit', FEMALE_LAST_DIGITS] }, 1, 0] } },
          },
        },
      ],
      { allowDiskUse: true }
    )
    .toArray();

  const map = new Map<string, ReportsVoterStats & { halkaName: string; blockCode: string }>();
  for (const row of rows) {
    const halkaName = String(row._id?.halkaName ?? '');
    const blockCode = String(row._id?.blockCode ?? '');
    map.set(`${halkaName}::${blockCode}`, {
      halkaName,
      blockCode,
      count: row.count ?? 0,
      male: row.male ?? 0,
      female: row.female ?? 0,
    });
  }
  return map;
}

export async function aggregateWorkProgress(
  db: Db,
  halkaFilter: Record<string, unknown>
): Promise<{
  byStatus: Record<string, number>;
  byHalka: Map<string, Record<string, number>>;
  byBlock: Map<string, string>;
}> {
  const match =
    Object.keys(halkaFilter).length > 0 ? { halkaName: halkaFilter.halkaName } : {};

  const rows = await db.collection('blockcodeworkprogress').find(match).toArray();

  const byStatus = emptyStatusCounts() as Record<string, number>;
  const byHalka = new Map<string, Record<string, number>>();
  const byBlock = new Map<string, string>();

  for (const row of rows) {
    const status = String(row.status ?? 'pending');
    byStatus[status] = (byStatus[status] ?? 0) + 1;

    const halkaName = String(row.halkaName ?? '');
    const halkaEntry = byHalka.get(halkaName) ?? emptyStatusCounts() as Record<string, number>;
    halkaEntry[status] = (halkaEntry[status] ?? 0) + 1;
    byHalka.set(halkaName, halkaEntry);

    byBlock.set(`${halkaName}::${row.blockCode}`, status);
  }

  return { byStatus, byHalka, byBlock };
}

export function buildBlockCodeRows(
  constituencies: Array<{ halkaName: string; blockCodes?: string[] }>,
  pageMap: Awaited<ReturnType<typeof aggregateBlockCodePages>>,
  voterMap: Awaited<ReturnType<typeof aggregateVotersByBlock>>,
  workByBlock: Map<string, string>
): ReportsBlockCodeRow[] {
  const rows: ReportsBlockCodeRow[] = [];
  const seen = new Set<string>();

  for (const constituency of constituencies) {
    for (const blockCode of constituency.blockCodes ?? []) {
      const key = `${constituency.halkaName}::${blockCode}`;
      seen.add(key);
      const pages = pageMap.get(key);
      const voters = voterMap.get(key);

      rows.push({
        halkaName: constituency.halkaName,
        blockCode,
        pages: pages?.pages ?? 0,
        pagesCompleted: pages?.pagesCompleted ?? 0,
        pagesProcessing: pages?.pagesProcessing ?? 0,
        pagesError: pages?.pagesError ?? 0,
        voters: {
          count: voters?.count ?? 0,
          male: voters?.male ?? 0,
          female: voters?.female ?? 0,
        },
        workStatus: workByBlock.get(key) ?? 'pending',
        pageTags: pages?.pageTags ?? {},
      });
    }
  }

  for (const [key, pages] of Array.from(pageMap.entries())) {
    if (seen.has(key)) {
      continue;
    }
    const voters = voterMap.get(key);
    rows.push({
      halkaName: pages.halkaName,
      blockCode: pages.blockCode,
      pages: pages.pages,
      pagesCompleted: pages.pagesCompleted,
      pagesProcessing: pages.pagesProcessing,
      pagesError: pages.pagesError,
      voters: {
        count: voters?.count ?? 0,
        male: voters?.male ?? 0,
        female: voters?.female ?? 0,
      },
      workStatus: workByBlock.get(key) ?? 'pending',
      pageTags: pages.pageTags,
    });
  }

  return rows.sort((a, b) => {
    const halka = a.halkaName.localeCompare(b.halkaName);
    if (halka !== 0) {
      return halka;
    }
    return a.blockCode.localeCompare(b.blockCode, undefined, { numeric: true });
  });
}

export function buildConstituencyRows(
  constituencies: Array<{
    halkaName: string;
    status?: string;
    totalVoters?: number;
    muslimMale?: number;
    muslimFemale?: number;
    qadianiMale?: number;
    qadianiFemale?: number;
    blockCodes?: string[];
    lastUpdated?: Date;
  }>,
  votersByHalka: Map<string, ReportsVoterStats>,
  pagesByHalka: Map<string, { byStatus: Record<string, number>; byTag: Record<string, number> }>,
  workByHalka: Map<string, Record<string, number>>
): ReportsConstituencyRow[] {
  return constituencies.map((doc) => {
    const pageData = pagesByHalka.get(doc.halkaName) ?? { byStatus: {}, byTag: {} };
    const pages = tallyPageStats(pageData.byStatus);
    const workProgress = workByHalka.get(doc.halkaName) ?? (emptyStatusCounts() as Record<string, number>);

    return {
      halkaName: doc.halkaName,
      status: doc.status ?? 'active',
      blockCodeCount: doc.blockCodes?.length ?? 0,
      estimatedVoters: doc.totalVoters ?? 0,
      muslimMale: doc.muslimMale ?? 0,
      muslimFemale: doc.muslimFemale ?? 0,
      qadianiMale: doc.qadianiMale ?? 0,
      qadianiFemale: doc.qadianiFemale ?? 0,
      voters: votersByHalka.get(doc.halkaName) ?? { count: 0, male: 0, female: 0 },
      pages,
      pagesByStatus: pageData.byStatus,
      pagesByTag: pageData.byTag,
      workProgress,
      lastUpdated: doc.lastUpdated ? new Date(doc.lastUpdated).toISOString() : null,
    };
  });
}

export { tallyPageStats, emptyPageStats };
