import type { Db } from 'mongodb';
import { appendCnicGenderFilter, type GenderFilter } from '@/lib/cnic';
import {
  buildMongoSortFromSpreadsheet,
  voterSortCollation,
  type SortDirection,
  type SpreadsheetSortField,
} from '@/lib/voter-batch';

export interface VoterSpreadsheetPosition {
  page: number;
  index: number;
  total: number;
}

export async function findVoterSpreadsheetPosition(
  db: Db,
  input: {
    voterId: string;
    blockCode: string;
    halkaName: string;
    genderFilter: GenderFilter;
    sortBy: SpreadsheetSortField;
    sortDir: SortDirection;
    pageSize: number;
  }
): Promise<VoterSpreadsheetPosition | null> {
  const query: Record<string, unknown> = {
    blockCode: input.blockCode,
    halkaName: input.halkaName,
  };
  appendCnicGenderFilter(query, input.genderFilter);

  const sort = buildMongoSortFromSpreadsheet(input.sortBy, input.sortDir);
  const collation = voterSortCollation(input.sortBy);

  let cursor = db.collection('voters').find(query, { projection: { _id: 1 } }).sort(sort);
  if (collation) {
    cursor = cursor.collation(collation);
  }

  const ids = await cursor.toArray();
  const index = ids.findIndex((doc) => String(doc._id) === input.voterId);
  if (index < 0) {
    return null;
  }

  return {
    page: Math.floor(index / input.pageSize) + 1,
    index,
    total: ids.length,
  };
}
