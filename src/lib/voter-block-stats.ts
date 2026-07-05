import type { Db } from 'mongodb';
import { genderFromCnic } from '@/lib/cnic';

export interface BlockVoterStats {
  count: number;
  male: number;
  female: number;
}

const MALE_LAST_DIGITS = ['1', '3', '5', '7', '9'];
const FEMALE_LAST_DIGITS = ['0', '2', '4', '6', '8'];

function cnicDigitsExpression(fieldPath = '$cnic') {
  return {
    $reduce: {
      input: { $range: [0, { $strLenCP: { $ifNull: [fieldPath, ''] } }] },
      initialValue: '',
      in: {
        $let: {
          vars: {
            ch: { $substrCP: [fieldPath, '$$this', 1] },
          },
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

function distinctCnicGenderPipeline(match: Record<string, unknown>) {
  return [
    {
      $match: {
        ...match,
        cnic: { $type: 'string', $nin: ['', null] },
      },
    },
    {
      $project: {
        cnicNorm: cnicDigitsExpression(),
      },
    },
    {
      $match: {
        cnicNorm: { $ne: '' },
      },
    },
    {
      $group: {
        _id: '$cnicNorm',
      },
    },
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
        male: {
          $sum: {
            $cond: [{ $in: ['$lastDigit', MALE_LAST_DIGITS] }, 1, 0],
          },
        },
        female: {
          $sum: {
            $cond: [{ $in: ['$lastDigit', FEMALE_LAST_DIGITS] }, 1, 0],
          },
        },
      },
    },
  ];
}

async function aggregateDistinctCnicStats(
  db: Db,
  match: Record<string, unknown>
): Promise<BlockVoterStats> {
  const rows = await db
    .collection('voters')
    .aggregate(distinctCnicGenderPipeline(match), { allowDiskUse: true })
    .toArray();

  const result = rows[0] as { count?: number; male?: number; female?: number } | undefined;
  return {
    count: result?.count ?? 0,
    male: result?.male ?? 0,
    female: result?.female ?? 0,
  };
}

function tallyDistinctVotersByCnic(rows: Array<{ cnic?: unknown }>): BlockVoterStats {
  const seen = new Set<string>();
  let male = 0;
  let female = 0;

  for (const row of rows) {
    const normalized = String(row.cnic ?? '').replace(/\D/g, '');
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    const gender = genderFromCnic(normalized);
    if (gender === 'male') {
      male += 1;
    } else if (gender === 'female') {
      female += 1;
    }
  }

  return { count: seen.size, male, female };
}

export async function getBlockVoterStats(
  db: Db,
  blockCode: string,
  halkaName: string
): Promise<BlockVoterStats> {
  return aggregateDistinctCnicStats(db, { blockCode, halkaName });
}

export async function getHalkaVoterStats(db: Db, halkaName: string): Promise<BlockVoterStats> {
  return aggregateDistinctCnicStats(db, { halkaName });
}

export { tallyDistinctVotersByCnic };
