import type { Db } from 'mongodb';
import { genderFromCnic } from '@/lib/cnic';

export interface BlockVoterStats {
  count: number;
  male: number;
  female: number;
}

export async function getBlockVoterStats(
  db: Db,
  blockCode: string,
  halkaName: string
): Promise<BlockVoterStats> {
  const rows = await db
    .collection('voters')
    .find({ blockCode, halkaName }, { projection: { cnic: 1, _id: 0 } })
    .toArray();

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
