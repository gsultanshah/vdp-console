import type { Collection, ObjectId } from 'mongodb';
import type { NormalizedPollingSchemeRow } from '@/lib/polling-scheme/types';

export interface PersistPollingSchemeInput {
  rows: NormalizedPollingSchemeRow[];
  halkaName: string;
  source: string;
  sourceFileName: string;
  sourceFileUrl: string;
  sourceStoragePath: string;
  importId: ObjectId;
  importedAt: Date;
  collection: Collection;
}

export interface PersistPollingSchemeResult {
  inserted: number;
  skipped: number;
  errors: string[];
}

function toBlockcodeValue(code: string): number | string {
  const numeric = Number.parseInt(code.replace(/[^\d]/g, ''), 10);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : code;
}

export async function persistPollingSchemeRows(
  input: PersistPollingSchemeInput
): Promise<PersistPollingSchemeResult> {
  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let index = 0; index < input.rows.length; index += 1) {
    const row = input.rows[index];

    if (row.rowType === 'Detail' && !row.electoralRollCode) {
      skipped += 1;
      continue;
    }

    const baseDoc = {
      sn: row.slNo,
      polling_station_name: row.pollingStation,
      area: row.areaName,
      blockcode: row.electoralRollCode ? toBlockcodeValue(row.electoralRollCode) : '',
      male: row.maleVoters,
      female: row.femaleVoters,
      total: row.totalVoters,
      male_booth: row.maleBooths,
      female_booth: row.femaleBooths,
      total_booth: row.totalBooths,
      halkaName: input.halkaName,
      type: row.stationType,
      source: input.source,
      sourceFileName: input.sourceFileName,
      sourceFileUrl: input.sourceFileUrl,
      sourceStoragePath: input.sourceStoragePath,
      importId: input.importId,
      importedAt: input.importedAt,
      page: row.page,
      district: row.district,
      areaType: row.areaType,
      rowType: row.rowType,
      sourceRawText: row.sourceRawText,
    };

    try {
      if (row.stationType === 'combined' && row.rowType === 'Detail' && row.electoralRollCode) {
        await input.collection.insertOne({ ...baseDoc, type: 'male' });
        await input.collection.insertOne({ ...baseDoc, type: 'female' });
        inserted += 2;
      } else {
        await input.collection.insertOne(baseDoc);
        inserted += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Insert failed';
      errors.push(`Row ${index + 1}: ${message}`);
    }
  }

  return { inserted, skipped, errors };
}
