import fs from 'fs/promises';
import path from 'path';
import type { Db } from 'mongodb';
import { ObjectId, connectNativeMongoClient, getVdpDb } from '@/lib/mongo-client';
import {
  canonicalPollingBlockcode,
  normalizePollingSchemeHalka,
  pollingBlockcodeLookupVariants,
} from '@/lib/polling-scheme/blockcode-lookup';
import { normalizePollingOverrideBlockKey } from '@/lib/voter-parchi/polling-station-overrides';

export const BLOCKCODE_RENAME_STEPS = [
  { id: 'constituency', label: 'Constituency block list' },
  { id: 'voters', label: 'Voters' },
  { id: 'pages', label: 'Uploaded pages' },
  { id: 'work_progress', label: 'Work progress' },
  { id: 'polling_scheme', label: 'Polling scheme' },
  { id: 'parchi_overrides', label: 'Polling station overrides' },
  { id: 'parchi_latest', label: 'Latest voter parchi files' },
  { id: 'mobile_access', label: 'Mobile access codes' },
  { id: 'parchi_jobs', label: 'Voter parchi jobs' },
  { id: 'export_jobs', label: 'Export jobs' },
] as const;

export type BlockCodeRenameStepId = (typeof BLOCKCODE_RENAME_STEPS)[number]['id'];

export type BlockCodeRenameStepStatus = 'pending' | 'running' | 'done' | 'skipped' | 'failed';

export interface BlockCodeRenameStepState {
  id: BlockCodeRenameStepId;
  label: string;
  status: BlockCodeRenameStepStatus;
  updatedCount: number;
  message?: string | null;
}

export interface BlockCodeRenameJob {
  _id?: string;
  halkaName: string;
  oldBlockCode: string;
  newBlockCode: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  currentStepIndex: number;
  steps: BlockCodeRenameStepState[];
  error?: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date | null;
}

const JOBS_COLLECTION = 'blockcode_rename_jobs';

function normalizeHalka(halkaName: string): string {
  return halkaName.replace(/\s+/g, '').toUpperCase();
}

function halkaMatchValues(halkaName: string): string[] {
  const normalized = normalizeHalka(halkaName);
  const trimmed = halkaName.trim();
  return Array.from(new Set([normalized, trimmed].filter(Boolean)));
}

function halkaFilter(halkaName: string): Record<string, unknown> {
  const values = halkaMatchValues(halkaName);
  return values.length === 1 ? { halkaName: values[0] } : { halkaName: { $in: values } };
}

/** All string forms that might represent this block code in Mongo. */
export function blockCodeStringVariants(blockCode: string): string[] {
  const trimmed = String(blockCode ?? '').trim();
  if (!trimmed) return [];

  const variants = new Set<string>([trimmed]);
  const digits = trimmed.replace(/\D/g, '');
  if (digits) {
    variants.add(digits);
    variants.add(digits.replace(/^0+/, '') || digits);
    if (digits.length <= 7) {
      variants.add(digits.padStart(7, '0'));
    }
    if (digits.length <= 9) {
      variants.add(digits.padStart(9, '0'));
    }
  }
  return Array.from(variants);
}

function sameBlockCode(a: string, b: string): boolean {
  const aDigits = String(a ?? '').replace(/\D/g, '');
  const bDigits = String(b ?? '').replace(/\D/g, '');
  if (aDigits && bDigits) {
    return aDigits.replace(/^0+/, '') === bDigits.replace(/^0+/, '') || aDigits === bDigits;
  }
  return String(a).trim() === String(b).trim();
}

function toJob(doc: Record<string, unknown>): BlockCodeRenameJob {
  return {
    _id: doc._id ? String(doc._id) : undefined,
    halkaName: String(doc.halkaName ?? ''),
    oldBlockCode: String(doc.oldBlockCode ?? ''),
    newBlockCode: String(doc.newBlockCode ?? ''),
    status: (doc.status as BlockCodeRenameJob['status']) ?? 'pending',
    currentStepIndex: Number(doc.currentStepIndex) || 0,
    steps: Array.isArray(doc.steps) ? (doc.steps as BlockCodeRenameStepState[]) : [],
    error: doc.error ? String(doc.error) : null,
    createdBy: String(doc.createdBy ?? ''),
    createdByName: String(doc.createdByName ?? ''),
    createdAt: doc.createdAt instanceof Date ? doc.createdAt : new Date(String(doc.createdAt ?? Date.now())),
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt : new Date(String(doc.updatedAt ?? Date.now())),
    completedAt:
      doc.completedAt instanceof Date
        ? doc.completedAt
        : doc.completedAt
          ? new Date(String(doc.completedAt))
          : null,
  };
}

function initialSteps(): BlockCodeRenameStepState[] {
  return BLOCKCODE_RENAME_STEPS.map((step) => ({
    id: step.id,
    label: step.label,
    status: 'pending',
    updatedCount: 0,
    message: null,
  }));
}

async function assertRenameAllowed(
  db: Db,
  halkaName: string,
  oldBlockCode: string,
  newBlockCode: string
): Promise<void> {
  const oldTrimmed = oldBlockCode.trim();
  const newTrimmed = newBlockCode.trim();
  if (!oldTrimmed || !newTrimmed) {
    throw new Error('Both current and new block codes are required.');
  }
  if (!newTrimmed.replace(/\D/g, '')) {
    throw new Error('New block code must contain digits.');
  }
  if (sameBlockCode(oldTrimmed, newTrimmed)) {
    throw new Error('New block code must be different from the current block code.');
  }

  const constituency = await db.collection('constituencies').findOne({
    ...halkaFilter(halkaName),
  });
  if (!constituency) {
    throw new Error(`Constituency ${normalizeHalka(halkaName)} not found.`);
  }

  const blockCodes = Array.isArray(constituency.blockCodes)
    ? constituency.blockCodes.map((code) => String(code))
    : [];
  const oldVariants = new Set(blockCodeStringVariants(oldTrimmed));
  const hasOld = blockCodes.some((code) => oldVariants.has(code) || sameBlockCode(code, oldTrimmed));
  if (!hasOld) {
    throw new Error(`Block code ${oldTrimmed} was not found in ${normalizeHalka(halkaName)}.`);
  }

  const newVariants = new Set(blockCodeStringVariants(newTrimmed));
  const conflict = blockCodes.find(
    (code) =>
      !sameBlockCode(code, oldTrimmed) && (newVariants.has(code) || sameBlockCode(code, newTrimmed))
  );
  if (conflict) {
    throw new Error(`Block code ${newTrimmed} already exists in this constituency (${conflict}).`);
  }
}

async function replaceInStringArray(
  values: unknown,
  oldVariants: Set<string>,
  oldBlockCode: string,
  newBlockCode: string
): Promise<{ next: string[]; changed: boolean }> {
  if (!Array.isArray(values)) {
    return { next: [], changed: false };
  }

  let changed = false;
  const next: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const code = String(value ?? '').trim();
    if (!code) continue;
    const replacement =
      oldVariants.has(code) || sameBlockCode(code, oldBlockCode) ? newBlockCode : code;
    if (replacement !== code) changed = true;
    if (seen.has(replacement)) continue;
    seen.add(replacement);
    next.push(replacement);
  }

  return { next, changed };
}

async function updateConstituency(
  db: Db,
  halkaName: string,
  oldBlockCode: string,
  newBlockCode: string
): Promise<number> {
  const oldVariants = new Set(blockCodeStringVariants(oldBlockCode));
  const constituency = await db.collection('constituencies').findOne({ ...halkaFilter(halkaName) });
  if (!constituency) return 0;

  const { next: nextBlockCodes, changed: codesChanged } = await replaceInStringArray(
    constituency.blockCodes,
    oldVariants,
    oldBlockCode,
    newBlockCode
  );

  let settingsChanged = false;
  const settings = Array.isArray(constituency.blockCodeColumnSettings)
    ? constituency.blockCodeColumnSettings.map((entry: Record<string, unknown>) => {
        const code = String(entry.blockCode ?? '');
        if (oldVariants.has(code) || sameBlockCode(code, oldBlockCode)) {
          settingsChanged = true;
          return { ...entry, blockCode: newBlockCode };
        }
        return entry;
      })
    : constituency.blockCodeColumnSettings;

  if (!codesChanged && !settingsChanged) return 0;

  await db.collection('constituencies').updateOne(
    { _id: constituency._id },
    {
      $set: {
        ...(codesChanged ? { blockCodes: nextBlockCodes } : {}),
        ...(settingsChanged ? { blockCodeColumnSettings: settings } : {}),
        lastUpdated: new Date(),
      },
    }
  );
  return 1;
}

async function updateVoters(
  db: Db,
  halkaName: string,
  oldBlockCode: string,
  newBlockCode: string
): Promise<number> {
  const oldVariants = blockCodeStringVariants(oldBlockCode);
  const result = await db.collection('voters').updateMany(
    {
      ...halkaFilter(halkaName),
      blockCode: { $in: oldVariants },
    },
    { $set: { blockCode: newBlockCode, updatedAt: new Date() } }
  );
  return result.modifiedCount;
}

async function updatePages(
  db: Db,
  halkaName: string,
  oldBlockCode: string,
  newBlockCode: string
): Promise<number> {
  const oldVariants = blockCodeStringVariants(oldBlockCode);
  const result = await db.collection('blockcodes').updateMany(
    {
      ...halkaFilter(halkaName),
      blockCode: { $in: oldVariants },
    },
    { $set: { blockCode: newBlockCode } }
  );
  return result.modifiedCount;
}

async function updateWorkProgress(
  db: Db,
  halkaName: string,
  oldBlockCode: string,
  newBlockCode: string
): Promise<number> {
  const oldVariants = blockCodeStringVariants(oldBlockCode);
  const collection = db.collection('blockcodeworkprogress');
  const docs = await collection
    .find({
      ...halkaFilter(halkaName),
      blockCode: { $in: oldVariants },
    })
    .toArray();

  let updated = 0;
  for (const doc of docs) {
    const existingNew = await collection.findOne({
      ...halkaFilter(halkaName),
      blockCode: newBlockCode,
    });
    if (existingNew && String(existingNew._id) !== String(doc._id)) {
      await collection.deleteOne({ _id: doc._id });
      updated += 1;
      continue;
    }
    await collection.updateOne(
      { _id: doc._id },
      { $set: { blockCode: newBlockCode, updatedAt: new Date() } }
    );
    updated += 1;
  }
  return updated;
}

async function updatePollingScheme(
  db: Db,
  halkaName: string,
  oldBlockCode: string,
  newBlockCode: string
): Promise<number> {
  const oldVariants = pollingBlockcodeLookupVariants(oldBlockCode);
  const newCanonical = canonicalPollingBlockcode(newBlockCode);
  const newValue =
    newCanonical ?? (String(newBlockCode).replace(/\D/g, '') || String(newBlockCode).trim());

  const result = await db.collection('polling_scheme').updateMany(
    {
      ...halkaFilter(normalizePollingSchemeHalka(halkaName)),
      blockcode: { $in: oldVariants },
    },
    {
      $set: {
        blockcode: newValue,
        updatedAt: new Date(),
      },
    }
  );
  return result.modifiedCount;
}

async function updateParchiOverrides(
  db: Db,
  halkaName: string,
  oldBlockCode: string,
  newBlockCode: string
): Promise<number> {
  const collection = db.collection('voter_parchi_polling_station_overrides');
  const oldKeys = blockCodeStringVariants(oldBlockCode).map((code) =>
    normalizePollingOverrideBlockKey(code)
  );
  const newKey = normalizePollingOverrideBlockKey(newBlockCode);
  const newCanonical = canonicalPollingBlockcode(newBlockCode);

  const docs = await collection
    .find({
      ...halkaFilter(halkaName),
      $or: [
        { normalizedBlockCode: { $in: oldKeys } },
        { blockCode: { $in: blockCodeStringVariants(oldBlockCode) } },
      ],
    })
    .toArray();

  let updated = 0;
  for (const doc of docs) {
    const existing = await collection.findOne({
      halkaName: normalizeHalka(halkaName),
      normalizedBlockCode: newKey,
    });
    if (existing && String(existing._id) !== String(doc._id)) {
      await collection.deleteOne({ _id: doc._id });
      updated += 1;
      continue;
    }
    await collection.updateOne(
      { _id: doc._id },
      {
        $set: {
          halkaName: normalizeHalka(halkaName),
          blockCode: newBlockCode,
          normalizedBlockCode: newKey,
          canonicalBlockCode: newCanonical,
          updatedAt: new Date(),
        },
      }
    );
    updated += 1;
  }
  return updated;
}

async function updateParchiLatest(
  db: Db,
  halkaName: string,
  oldBlockCode: string,
  newBlockCode: string
): Promise<number> {
  const collection = db.collection('voter_parchi_latest');
  const oldKeys = blockCodeStringVariants(oldBlockCode).map((code) =>
    normalizePollingOverrideBlockKey(code)
  );
  const newKey = normalizePollingOverrideBlockKey(newBlockCode);
  const normalizedHalka = normalizeHalka(halkaName);

  const docs = await collection
    .find({
      halkaName: normalizedHalka,
      blockCode: { $in: Array.from(new Set([...oldKeys, ...blockCodeStringVariants(oldBlockCode)])) },
    })
    .toArray();

  let updated = 0;
  for (const doc of docs) {
    const oldLocalPath = String(doc.localPath ?? '');
    const newLocalPath = path.join(
      path.dirname(
        oldLocalPath || path.join(process.cwd(), 'data', 'voter-parchi-latest', normalizedHalka)
      ),
      `${newKey}.pdf`
    );

    if (oldLocalPath && oldLocalPath !== newLocalPath) {
      try {
        await fs.mkdir(path.dirname(newLocalPath), { recursive: true });
        await fs.rename(oldLocalPath, newLocalPath);
      } catch {
        try {
          await fs.copyFile(oldLocalPath, newLocalPath);
          await fs.unlink(oldLocalPath).catch(() => undefined);
        } catch {
          // Local file may already be missing; DB update still proceeds.
        }
      }
    }

    const existing = await collection.findOne({
      halkaName: normalizedHalka,
      blockCode: newKey,
    });
    if (existing && String(existing._id) !== String(doc._id)) {
      await collection.deleteOne({ _id: doc._id });
      updated += 1;
      continue;
    }

    await collection.updateOne(
      { _id: doc._id },
      {
        $set: {
          blockCode: newKey,
          localPath: oldLocalPath ? newLocalPath : doc.localPath,
          downloadUrl: `/api/voter-parchi/latest/download/?halkaName=${encodeURIComponent(normalizedHalka)}&blockCode=${encodeURIComponent(newBlockCode)}`,
          updatedAt: new Date(),
        },
      }
    );
    updated += 1;
  }
  return updated;
}

async function updateMobileAccess(
  db: Db,
  halkaName: string,
  oldBlockCode: string,
  newBlockCode: string
): Promise<number> {
  const oldVariants = new Set(blockCodeStringVariants(oldBlockCode));
  const docs = await db
    .collection('mobile_access_codes')
    .find({
      ...halkaFilter(halkaName),
      selectAllBlockCodes: { $ne: true },
      blockCodes: { $in: Array.from(oldVariants) },
    })
    .toArray();

  let updated = 0;
  for (const doc of docs) {
    const { next, changed } = await replaceInStringArray(
      doc.blockCodes,
      oldVariants,
      oldBlockCode,
      newBlockCode
    );
    if (!changed) continue;
    await db.collection('mobile_access_codes').updateOne(
      { _id: doc._id },
      { $set: { blockCodes: next, updatedAt: new Date() } }
    );
    updated += 1;
  }
  return updated;
}

async function updateJobsWithBlockArrays(
  db: Db,
  collectionName: string,
  halkaName: string,
  oldBlockCode: string,
  newBlockCode: string
): Promise<number> {
  const oldVariants = new Set(blockCodeStringVariants(oldBlockCode));
  const docs = await db
    .collection(collectionName)
    .find({
      ...halkaFilter(halkaName),
      blockCodes: { $in: Array.from(oldVariants) },
    })
    .toArray();

  let updated = 0;
  for (const doc of docs) {
    const { next, changed } = await replaceInStringArray(
      doc.blockCodes,
      oldVariants,
      oldBlockCode,
      newBlockCode
    );
    if (!changed) continue;
    await db.collection(collectionName).updateOne(
      { _id: doc._id },
      { $set: { blockCodes: next, updatedAt: new Date() } }
    );
    updated += 1;
  }
  return updated;
}

async function updateExportJobs(
  db: Db,
  halkaName: string,
  oldBlockCode: string,
  newBlockCode: string
): Promise<number> {
  const oldVariants = new Set(blockCodeStringVariants(oldBlockCode));
  const docs = await db
    .collection('exportjobs')
    .find({
      ...halkaFilter(halkaName),
      $or: [
        { blockCodes: { $in: Array.from(oldVariants) } },
        { 'blockCodeProgress.blockCode': { $in: Array.from(oldVariants) } },
        { 'outputFiles.blockCode': { $in: Array.from(oldVariants) } },
      ],
    })
    .toArray();

  let updated = 0;
  for (const doc of docs) {
    const { next: nextBlockCodes, changed: codesChanged } = await replaceInStringArray(
      doc.blockCodes,
      oldVariants,
      oldBlockCode,
      newBlockCode
    );

    let nestedChanged = false;
    const blockCodeProgress = Array.isArray(doc.blockCodeProgress)
      ? doc.blockCodeProgress.map((entry: Record<string, unknown>) => {
          const code = String(entry.blockCode ?? '');
          if (oldVariants.has(code) || sameBlockCode(code, oldBlockCode)) {
            nestedChanged = true;
            return { ...entry, blockCode: newBlockCode };
          }
          return entry;
        })
      : doc.blockCodeProgress;

    const outputFiles = Array.isArray(doc.outputFiles)
      ? doc.outputFiles.map((entry: Record<string, unknown>) => {
          const code = String(entry.blockCode ?? '');
          if (oldVariants.has(code) || sameBlockCode(code, oldBlockCode)) {
            nestedChanged = true;
            return { ...entry, blockCode: newBlockCode };
          }
          return entry;
        })
      : doc.outputFiles;

    if (!codesChanged && !nestedChanged) continue;

    await db.collection('exportjobs').updateOne(
      { _id: doc._id },
      {
        $set: {
          ...(codesChanged ? { blockCodes: nextBlockCodes } : {}),
          ...(nestedChanged
            ? {
                blockCodeProgress,
                outputFiles,
              }
            : {}),
          updatedAt: new Date(),
        },
      }
    );
    updated += 1;
  }
  return updated;
}

export async function createBlockCodeRenameJob(input: {
  halkaName: string;
  oldBlockCode: string;
  newBlockCode: string;
  createdBy: string;
  createdByName: string;
}): Promise<BlockCodeRenameJob> {
  const client = await connectNativeMongoClient();
  const db = getVdpDb(client);
  const halkaName = normalizeHalka(input.halkaName);
  const oldBlockCode = String(input.oldBlockCode ?? '').trim();
  const newBlockCode = String(input.newBlockCode ?? '').trim();

  await assertRenameAllowed(db, halkaName, oldBlockCode, newBlockCode);

  const doc = {
    halkaName,
    oldBlockCode,
    newBlockCode,
    status: 'pending' as const,
    currentStepIndex: 0,
    steps: initialSteps(),
    error: null,
    createdBy: input.createdBy,
    createdByName: input.createdByName,
    createdAt: new Date(),
    updatedAt: new Date(),
    completedAt: null,
  };

  const result = await db.collection(JOBS_COLLECTION).insertOne(doc);
  return toJob({ ...doc, _id: result.insertedId });
}

export async function getBlockCodeRenameJob(jobId: string): Promise<BlockCodeRenameJob | null> {
  if (!ObjectId.isValid(jobId)) return null;
  const client = await connectNativeMongoClient();
  const db = getVdpDb(client);
  const doc = await db.collection(JOBS_COLLECTION).findOne({ _id: new ObjectId(jobId) });
  return doc ? toJob(doc as Record<string, unknown>) : null;
}

export async function processBlockCodeRenameStep(jobId: string): Promise<BlockCodeRenameJob> {
  if (!ObjectId.isValid(jobId)) {
    throw new Error('Invalid rename job id');
  }

  const client = await connectNativeMongoClient();
  const db = getVdpDb(client);
  const collection = db.collection(JOBS_COLLECTION);
  const raw = await collection.findOne({ _id: new ObjectId(jobId) });
  if (!raw) throw new Error('Rename job not found');

  const job = toJob(raw as Record<string, unknown>);
  if (job.status === 'completed' || job.status === 'failed') {
    return job;
  }

  const stepIndex = job.currentStepIndex;
  if (stepIndex >= job.steps.length) {
    const completed = {
      status: 'completed' as const,
      completedAt: new Date(),
      updatedAt: new Date(),
      error: null,
    };
    await collection.updateOne({ _id: new ObjectId(jobId) }, { $set: completed });
    return { ...job, ...completed };
  }

  const step = job.steps[stepIndex];
  const steps = [...job.steps];
  steps[stepIndex] = { ...step, status: 'running', message: null };

  await collection.updateOne(
    { _id: new ObjectId(jobId) },
    {
      $set: {
        status: 'running',
        steps,
        updatedAt: new Date(),
        error: null,
      },
    }
  );

  try {
    let updatedCount = 0;
    let message: string | null = null;

    switch (step.id) {
      case 'constituency':
        updatedCount = await updateConstituency(db, job.halkaName, job.oldBlockCode, job.newBlockCode);
        message = updatedCount ? 'Constituency block list updated' : 'No constituency changes needed';
        break;
      case 'voters':
        updatedCount = await updateVoters(db, job.halkaName, job.oldBlockCode, job.newBlockCode);
        message = `${updatedCount.toLocaleString()} voter(s) updated`;
        break;
      case 'pages':
        updatedCount = await updatePages(db, job.halkaName, job.oldBlockCode, job.newBlockCode);
        message = `${updatedCount.toLocaleString()} page(s) updated`;
        break;
      case 'work_progress':
        updatedCount = await updateWorkProgress(db, job.halkaName, job.oldBlockCode, job.newBlockCode);
        message = `${updatedCount.toLocaleString()} work progress record(s) updated`;
        break;
      case 'polling_scheme':
        updatedCount = await updatePollingScheme(db, job.halkaName, job.oldBlockCode, job.newBlockCode);
        message = `${updatedCount.toLocaleString()} polling scheme row(s) updated`;
        break;
      case 'parchi_overrides':
        updatedCount = await updateParchiOverrides(db, job.halkaName, job.oldBlockCode, job.newBlockCode);
        message = `${updatedCount.toLocaleString()} polling override(s) updated`;
        break;
      case 'parchi_latest':
        updatedCount = await updateParchiLatest(db, job.halkaName, job.oldBlockCode, job.newBlockCode);
        message = `${updatedCount.toLocaleString()} latest parchi record(s) updated`;
        break;
      case 'mobile_access':
        updatedCount = await updateMobileAccess(db, job.halkaName, job.oldBlockCode, job.newBlockCode);
        message = `${updatedCount.toLocaleString()} mobile access code(s) updated`;
        break;
      case 'parchi_jobs': {
        const web = await updateJobsWithBlockArrays(
          db,
          'voter_parchi_jobs',
          job.halkaName,
          job.oldBlockCode,
          job.newBlockCode
        );
        const cli = await updateJobsWithBlockArrays(
          db,
          'voter_parchi_cli_jobs',
          job.halkaName,
          job.oldBlockCode,
          job.newBlockCode
        );
        updatedCount = web + cli;
        message = `${updatedCount.toLocaleString()} parchi job(s) updated`;
        break;
      }
      case 'export_jobs':
        updatedCount = await updateExportJobs(db, job.halkaName, job.oldBlockCode, job.newBlockCode);
        message = `${updatedCount.toLocaleString()} export job(s) updated`;
        break;
      default:
        message = 'Unknown step skipped';
    }

    steps[stepIndex] = {
      ...step,
      status: updatedCount > 0 ? 'done' : 'skipped',
      updatedCount,
      message,
    };

    const nextIndex = stepIndex + 1;
    const isComplete = nextIndex >= steps.length;
    const patch = {
      steps,
      currentStepIndex: nextIndex,
      status: isComplete ? ('completed' as const) : ('running' as const),
      updatedAt: new Date(),
      completedAt: isComplete ? new Date() : null,
      error: null,
    };

    await collection.updateOne({ _id: new ObjectId(jobId) }, { $set: patch });
    return { ...job, ...patch, steps };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Rename step failed';
    steps[stepIndex] = {
      ...step,
      status: 'failed',
      updatedCount: 0,
      message: errorMessage,
    };
    await collection.updateOne(
      { _id: new ObjectId(jobId) },
      {
        $set: {
          steps,
          status: 'failed',
          error: errorMessage,
          updatedAt: new Date(),
        },
      }
    );
    throw error;
  }
}
