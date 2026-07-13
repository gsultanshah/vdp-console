import type { Collection, ObjectId } from 'mongodb';
import type { NormalizedPollingSchemeRow } from '@/lib/polling-scheme/types';
import { buildExactDuplicateKey, buildRowFingerprint } from '@/lib/polling-scheme/ai-validation';

export interface UpsertPollingSchemeInput {
  rows: NormalizedPollingSchemeRow[];
  halkaName: string;
  source: string;
  sourceFileName: string;
  sourceFileUrl: string;
  sourceStoragePath: string;
  importId: ObjectId;
  jobId: string;
  page: number;
  pageImageHash: string;
  importedAt: Date;
  collection: Collection;
  processedFingerprints?: Set<string>;
}

export interface UpsertPollingSchemeResult {
  upserted: number;
  skipped: number;
  updated: number;
  errors: string[];
}

function toBlockcodeValue(code: string): number | string {
  const numeric = Number.parseInt(code.replace(/[^\d]/g, ''), 10);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : code;
}

function buildMongoDoc(
  row: NormalizedPollingSchemeRow,
  stationType: string,
  input: UpsertPollingSchemeInput
) {
  const fingerprint = buildRowFingerprint(input.halkaName, row, stationType);
  const exactKey = buildExactDuplicateKey(
    input.jobId,
    input.page,
    input.pageImageHash,
    row,
    stationType
  );

  return {
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
    type: stationType,
    source: input.source,
    sourceFileName: input.sourceFileName,
    sourceFileUrl: input.sourceFileUrl,
    sourceStoragePath: input.sourceStoragePath,
    importId: input.importId,
    aiJobId: input.jobId,
    sourcePage: input.page,
    sourcePageHash: input.pageImageHash,
    rowFingerprint: fingerprint,
    exactDuplicateKey: exactKey,
    importedAt: input.importedAt,
    page: row.page,
    district: row.district,
    areaType: row.areaType,
    rowType: row.rowType,
    sourceRawText: row.sourceRawText,
    updatedAt: input.importedAt,
  };
}

async function findExistingByFingerprint(
  collection: Collection,
  halkaName: string,
  fingerprint: string
) {
  return collection.findOne({ halkaName, rowFingerprint: fingerprint });
}

export async function upsertPollingSchemeRows(
  input: UpsertPollingSchemeInput
): Promise<UpsertPollingSchemeResult> {
  let upserted = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];
  const seenExact = input.processedFingerprints ?? new Set<string>();

  for (let index = 0; index < input.rows.length; index += 1) {
    const row = input.rows[index];

    if (row.rowType === 'Detail' && !row.electoralRollCode) {
      skipped += 1;
      continue;
    }

    const stationTypes: Array<'male' | 'female' | 'combined'> =
      row.stationType === 'combined' && row.rowType === 'Detail' && row.electoralRollCode
        ? ['male', 'female']
        : [row.stationType];

    for (const stationType of stationTypes) {
      const doc = buildMongoDoc(row, stationType, input);

      if (seenExact.has(doc.exactDuplicateKey)) {
        skipped += 1;
        continue;
      }
      seenExact.add(doc.exactDuplicateKey);

      const exactExisting = await input.collection.findOne({
        exactDuplicateKey: doc.exactDuplicateKey,
      });
      if (exactExisting) {
        skipped += 1;
        continue;
      }

      try {
        const existing = await findExistingByFingerprint(
          input.collection,
          input.halkaName,
          doc.rowFingerprint
        );

        if (existing) {
          await input.collection.updateOne(
            { _id: existing._id },
            {
              $set: {
                ...doc,
                importId: existing.importId ?? doc.importId,
                importedAt: existing.importedAt ?? doc.importedAt,
              },
            }
          );
          updated += 1;
        } else {
          await input.collection.insertOne(doc);
          upserted += 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Upsert failed';
        errors.push(`Row ${index + 1} (${stationType}): ${message}`);
      }
    }
  }

  return { upserted, skipped, updated, errors };
}

export async function ensurePollingSchemeUpsertIndexes(collection: Collection): Promise<void> {
  await collection.createIndex({ exactDuplicateKey: 1 }, { unique: true, sparse: true });
  await collection.createIndex({ rowFingerprint: 1, halkaName: 1 });
  await collection.createIndex({ aiJobId: 1, sourcePage: 1 });
}
