import fs from 'fs/promises';
import path from 'path';
import { ObjectId, type Db } from 'mongodb';
import { connectNativeMongoClient } from '@/lib/mongo-client';
import { uploadBufferToFirebaseStorage } from '@/lib/firebase-storage';
import { createDefaultDesign } from '@/lib/voter-parchi/defaults';
import { buildParchiPdfBuffer, countPdfPages } from '@/lib/voter-parchi/pdf-generator';
import {
  PARCHI_BATCH_SIZE,
  type ParchiOutputFile,
  type VoterParchiDesign,
  type VoterParchiJob,
} from '@/lib/voter-parchi/types';
import {
  enrichVotersWithPolling,
  parseObjectIdCursor,
  voterFilterQuery,
} from '@/lib/voter-parchi/voter-data';

const DESIGNS_COLLECTION = 'voter_parchi_designs';
const JOBS_COLLECTION = 'voter_parchi_jobs';

function normalizeHalka(halkaName: string): string {
  return halkaName.replace(/\s+/g, '').toUpperCase();
}

function getParchiJobsRoot(): string {
  return path.join(process.cwd(), 'data', 'voter-parchi');
}

function getJobDir(jobId: string): string {
  return path.join(getParchiJobsRoot(), jobId);
}

function toDesign(doc: Record<string, unknown>): VoterParchiDesign {
  return {
    _id: String(doc._id),
    halkaName: String(doc.halkaName ?? ''),
    name: String(doc.name ?? 'Design'),
    description: String(doc.description ?? ''),
    isDefault: Boolean(doc.isDefault),
    parchiPerPage: Number(doc.parchiPerPage) || 3,
    slots: Array.isArray(doc.slots) ? (doc.slots as VoterParchiDesign['slots']) : [],
    assets: Array.isArray(doc.assets) ? (doc.assets as VoterParchiDesign['assets']) : [],
    symbolAssetId: doc.symbolAssetId ? String(doc.symbolAssetId) : null,
    photoAssetId: doc.photoAssetId ? String(doc.photoAssetId) : null,
    headerAssetId: doc.headerAssetId ? String(doc.headerAssetId) : null,
    customHeaderText: String(doc.customHeaderText ?? ''),
    createdBy: String(doc.createdBy ?? ''),
    createdByName: String(doc.createdByName ?? ''),
    createdAt: doc.createdAt ? new Date(doc.createdAt as string | Date) : undefined,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt as string | Date) : undefined,
  };
}

function toJob(doc: Record<string, unknown>): VoterParchiJob {
  return {
    _id: String(doc._id),
    halkaName: String(doc.halkaName ?? ''),
    designId: String(doc.designId ?? ''),
    designName: String(doc.designName ?? ''),
    blockCodes: Array.isArray(doc.blockCodes) ? doc.blockCodes.map(String) : [],
    selectAllBlockCodes: Boolean(doc.selectAllBlockCodes),
    genderFilter: (doc.genderFilter as VoterParchiJob['genderFilter']) ?? 'both',
    status: (doc.status as VoterParchiJob['status']) ?? 'pending',
    totalVoters: Number(doc.totalVoters) || 0,
    processedVoters: Number(doc.processedVoters) || 0,
    lastVoterId: doc.lastVoterId ? String(doc.lastVoterId) : null,
    outputFiles: Array.isArray(doc.outputFiles) ? (doc.outputFiles as ParchiOutputFile[]) : [],
    currentPartIndex: Number(doc.currentPartIndex) || 0,
    currentPartVoterCount: Number(doc.currentPartVoterCount) || 0,
    error: doc.error ? String(doc.error) : null,
    createdBy: String(doc.createdBy ?? ''),
    createdByName: String(doc.createdByName ?? ''),
    createdAt: doc.createdAt ? new Date(doc.createdAt as string | Date) : undefined,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt as string | Date) : undefined,
    completedAt: doc.completedAt ? new Date(doc.completedAt as string | Date) : null,
  };
}

export function jobProgressPercent(job: VoterParchiJob): number {
  if (job.totalVoters <= 0) return job.status === 'completed' ? 100 : 0;
  return Math.min(100, Math.round((job.processedVoters / job.totalVoters) * 100));
}

export async function listDesigns(halkaName: string): Promise<VoterParchiDesign[]> {
  const client = await connectNativeMongoClient();
  try {
    const db = client.db('vdp');
    const normalized = normalizeHalka(halkaName);
    const docs = await db
      .collection(DESIGNS_COLLECTION)
      .find({ halkaName: normalized })
      .sort({ isDefault: -1, updatedAt: -1 })
      .toArray();
    return docs.map((doc) => toDesign(doc as Record<string, unknown>));
  } finally {
    await client.close();
  }
}

export async function getDesignById(designId: string, db?: Db): Promise<VoterParchiDesign | null> {
  const ownClient = db ? null : await connectNativeMongoClient();
  try {
    const database = db ?? ownClient!.db('vdp');
    const doc = await database.collection(DESIGNS_COLLECTION).findOne({ _id: new ObjectId(designId) });
    return doc ? toDesign(doc as Record<string, unknown>) : null;
  } finally {
    if (ownClient) await ownClient.close();
  }
}

export async function ensureDefaultDesign(halkaName: string, createdBy = 'system'): Promise<VoterParchiDesign> {
  const client = await connectNativeMongoClient();
  try {
    const db = client.db('vdp');
    const normalized = normalizeHalka(halkaName);
    const existing = await db.collection(DESIGNS_COLLECTION).findOne({ halkaName: normalized, isDefault: true });
    if (existing) return toDesign(existing as Record<string, unknown>);

    const design = createDefaultDesign(normalized);
    const result = await db.collection(DESIGNS_COLLECTION).insertOne({
      ...design,
      createdBy,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return { ...design, _id: String(result.insertedId) };
  } finally {
    await client.close();
  }
}

export async function createDesign(
  input: Partial<VoterParchiDesign> & { halkaName: string; name: string },
  createdBy: string,
  createdByName: string
): Promise<VoterParchiDesign> {
  const client = await connectNativeMongoClient();
  try {
    const db = client.db('vdp');
    const normalized = normalizeHalka(input.halkaName);
    const doc = {
      halkaName: normalized,
      name: input.name,
      description: input.description ?? '',
      isDefault: Boolean(input.isDefault),
      parchiPerPage: input.parchiPerPage ?? 3,
      slots: input.slots ?? createDefaultDesign(normalized).slots,
      assets: input.assets ?? [],
      symbolAssetId: input.symbolAssetId ?? null,
      photoAssetId: input.photoAssetId ?? null,
      headerAssetId: input.headerAssetId ?? null,
      customHeaderText: input.customHeaderText ?? '',
      createdBy,
      createdByName,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (doc.isDefault) {
      await db.collection(DESIGNS_COLLECTION).updateMany(
        { halkaName: normalized, isDefault: true },
        { $set: { isDefault: false, updatedAt: new Date() } }
      );
    }

    const result = await db.collection(DESIGNS_COLLECTION).insertOne(doc);
    return toDesign({ ...doc, _id: result.insertedId } as Record<string, unknown>);
  } finally {
    await client.close();
  }
}

export async function updateDesign(
  designId: string,
  updates: Partial<VoterParchiDesign>
): Promise<VoterParchiDesign | null> {
  const client = await connectNativeMongoClient();
  try {
    const db = client.db('vdp');
    const { _id, createdAt, ...rest } = updates;
    const setDoc: Record<string, unknown> = { ...rest, updatedAt: new Date() };

    if (updates.isDefault) {
      const existing = await db.collection(DESIGNS_COLLECTION).findOne({ _id: new ObjectId(designId) });
      if (existing) {
        await db.collection(DESIGNS_COLLECTION).updateMany(
          { halkaName: existing.halkaName, isDefault: true },
          { $set: { isDefault: false, updatedAt: new Date() } }
        );
      }
    }

    await db.collection(DESIGNS_COLLECTION).updateOne({ _id: new ObjectId(designId) }, { $set: setDoc });
    const doc = await db.collection(DESIGNS_COLLECTION).findOne({ _id: new ObjectId(designId) });
    return doc ? toDesign(doc as Record<string, unknown>) : null;
  } finally {
    await client.close();
  }
}

export async function deleteDesign(designId: string): Promise<boolean> {
  const client = await connectNativeMongoClient();
  try {
    const db = client.db('vdp');
    const result = await db.collection(DESIGNS_COLLECTION).deleteOne({ _id: new ObjectId(designId) });
    return result.deletedCount > 0;
  } finally {
    await client.close();
  }
}

export async function addDesignAsset(
  designId: string,
  asset: VoterParchiDesign['assets'][number]
): Promise<VoterParchiDesign | null> {
  const client = await connectNativeMongoClient();
  try {
    const db = client.db('vdp');
    const existing = await db.collection(DESIGNS_COLLECTION).findOne({ _id: new ObjectId(designId) });
    if (!existing) return null;
    const assets = Array.isArray(existing.assets) ? [...existing.assets, asset] : [asset];
    await db.collection(DESIGNS_COLLECTION).updateOne(
      { _id: new ObjectId(designId) },
      { $set: { assets, updatedAt: new Date() } }
    );
    const doc = await db.collection(DESIGNS_COLLECTION).findOne({ _id: new ObjectId(designId) });
    return doc ? toDesign(doc as Record<string, unknown>) : null;
  } finally {
    await client.close();
  }
}

async function countVotersForJob(db: Db, job: VoterParchiJob): Promise<number> {
  const filter = voterFilterQuery(
    job.halkaName,
    job.blockCodes,
    job.selectAllBlockCodes,
    job.genderFilter
  );
  return db.collection('voters').countDocuments(filter);
}

function normalizeBlockCodes(codes: string[] | undefined): string[] {
  return Array.from(new Set((codes ?? []).map((c) => String(c).trim()).filter(Boolean)));
}

export async function createParchiJob(input: {
  halkaName: string;
  designId: string;
  blockCodes?: string[];
  selectAllBlockCodes?: boolean;
  genderFilter?: VoterParchiJob['genderFilter'];
  createdBy: string;
  createdByName: string;
}): Promise<VoterParchiJob> {
  const client = await connectNativeMongoClient();
  try {
    const db = client.db('vdp');
    const normalized = normalizeHalka(input.halkaName);
    const design = await getDesignById(input.designId, db);
    if (!design) throw new Error('Design not found');

    const selectAll = Boolean(input.selectAllBlockCodes);
    const blockCodes = normalizeBlockCodes(input.blockCodes);

    if (!selectAll && blockCodes.length === 0) {
      throw new Error('Select at least one block code, or choose all block codes.');
    }

    const jobDoc = {
      halkaName: normalized,
      designId: input.designId,
      designName: design.name,
      blockCodes: selectAll ? [] : blockCodes,
      selectAllBlockCodes: selectAll,
      genderFilter: input.genderFilter ?? 'both',
      status: 'pending' as const,
      totalVoters: 0,
      processedVoters: 0,
      lastVoterId: null,
      outputFiles: [],
      currentPartIndex: 0,
      currentPartVoterCount: 0,
      error: null,
      createdBy: input.createdBy,
      createdByName: input.createdByName,
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: null,
    };

    const result = await db.collection(JOBS_COLLECTION).insertOne(jobDoc);
    const job = toJob({ ...jobDoc, _id: result.insertedId } as Record<string, unknown>);
    const totalVoters = await countVotersForJob(db, job);

    if (totalVoters === 0) {
      await db.collection(JOBS_COLLECTION).updateOne(
        { _id: result.insertedId },
        {
          $set: {
            totalVoters: 0,
            status: 'failed',
            error: selectAll
              ? 'No voters found for this constituency.'
              : `No voters found for the selected block code(s): ${blockCodes.join(', ')}.`,
            updatedAt: new Date(),
          },
        }
      );
      job.totalVoters = 0;
      job.status = 'failed';
      job.error = selectAll
        ? 'No voters found for this constituency.'
        : `No voters found for the selected block code(s): ${blockCodes.join(', ')}.`;
      return job;
    }

    await db.collection(JOBS_COLLECTION).updateOne(
      { _id: result.insertedId },
      { $set: { totalVoters, status: 'running', updatedAt: new Date() } }
    );
    job.totalVoters = totalVoters;
    job.status = 'running';
    return job;
  } finally {
    await client.close();
  }
}

export async function listParchiJobs(halkaName: string, limit = 20): Promise<VoterParchiJob[]> {
  const client = await connectNativeMongoClient();
  try {
    const db = client.db('vdp');
    const docs = await db
      .collection(JOBS_COLLECTION)
      .find({ halkaName: normalizeHalka(halkaName) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
    return docs.map((doc) => toJob(doc as Record<string, unknown>));
  } finally {
    await client.close();
  }
}

export async function getParchiJob(jobId: string, db?: Db): Promise<VoterParchiJob | null> {
  const ownClient = db ? null : await connectNativeMongoClient();
  try {
    const database = db ?? ownClient!.db('vdp');
    const doc = await database.collection(JOBS_COLLECTION).findOne({ _id: new ObjectId(jobId) });
    return doc ? toJob(doc as Record<string, unknown>) : null;
  } finally {
    if (ownClient) await ownClient.close();
  }
}

async function savePdfPart(
  halkaName: string,
  jobId: string,
  partIndex: number,
  buffer: Buffer,
  voterCount: number,
  parchiPerPage: number
): Promise<ParchiOutputFile> {
  const fileName =
    partIndex === 0
      ? `${halkaName}-voter-parchi.pdf`
      : `${halkaName}-voter-parchi-part-${String(partIndex + 1).padStart(3, '0')}.pdf`;

  const jobDir = getJobDir(jobId);
  await fs.mkdir(jobDir, { recursive: true });
  const localPath = path.join(jobDir, fileName);
  await fs.writeFile(localPath, buffer);

  const localDownloadUrl = `/api/voter-parchi/jobs/${jobId}/download?file=${encodeURIComponent(fileName)}`;
  let downloadUrl = localDownloadUrl;
  let storagePath = `local:${localPath}`;

  try {
    const firebasePath = `${halkaName}/voter-parchi/${jobId}/${fileName}`;
    downloadUrl = await uploadBufferToFirebaseStorage(buffer, firebasePath, 'application/pdf');
    storagePath = firebasePath;
  } catch (error) {
    console.warn(
      'Firebase upload skipped for voter parchi; using local download.',
      error instanceof Error ? error.message : error
    );
  }

  return {
    partIndex,
    fileName,
    storagePath,
    downloadUrl,
    voterCount,
    pageCount: countPdfPages(voterCount, parchiPerPage),
    sizeBytes: buffer.length,
  };
}

export async function getParchiLocalFilePath(jobId: string, fileName: string): Promise<string | null> {
  const safeName = path.basename(fileName);
  if (!safeName || safeName !== fileName || safeName.includes('..')) {
    return null;
  }
  const filePath = path.join(getJobDir(jobId), safeName);
  try {
    await fs.access(filePath);
    return filePath;
  } catch {
    return null;
  }
}

export async function processParchiBatch(jobId: string): Promise<VoterParchiJob | null> {
  const client = await connectNativeMongoClient();
  const db = client.db('vdp');

  try {
    const jobDoc = await db.collection(JOBS_COLLECTION).findOne({ _id: new ObjectId(jobId) });
    if (!jobDoc) return null;

    const job = toJob(jobDoc as Record<string, unknown>);
    if (['completed', 'failed', 'cancelled'].includes(job.status)) {
      return job;
    }

    const design = await getDesignById(job.designId, db);
    if (!design) {
      await db.collection(JOBS_COLLECTION).updateOne(
        { _id: new ObjectId(jobId) },
        { $set: { status: 'failed', error: 'Design not found', updatedAt: new Date() } }
      );
      return await getParchiJob(jobId, db);
    }

    const filter = voterFilterQuery(
      job.halkaName,
      job.blockCodes,
      job.selectAllBlockCodes,
      job.genderFilter
    );
    const cursorId = parseObjectIdCursor(job.lastVoterId);
    if (cursorId) {
      filter._id = { $gt: cursorId };
    }

    const batchLimit = PARCHI_BATCH_SIZE;

    const voterDocs = await db
      .collection('voters')
      .find(filter)
      .sort({ _id: 1 })
      .limit(batchLimit)
      .project({
        _id: 1,
        cnic: 1,
        name: 1,
        fatherName: 1,
        age: 1,
        address: 1,
        previousAddress: 1,
        blockCode: 1,
        silsilaNo: 1,
        gharanaNo: 1,
        gender: 1,
        profession: 1,
        religion: 1,
        imageUrl: 1,
        rowY: 1,
        rowHeight: 1,
        reproduction: 1,
        halkaName: 1,
      })
      .toArray();

    if (voterDocs.length === 0) {
      await db.collection(JOBS_COLLECTION).updateOne(
        { _id: new ObjectId(jobId) },
        {
          $set: {
            status: 'completed',
            completedAt: new Date(),
            updatedAt: new Date(),
            error: null,
          },
        }
      );
      return await getParchiJob(jobId, db);
    }

    const voters = await enrichVotersWithPolling(db, job.halkaName, voterDocs as Record<string, unknown>[]);
    const pdfBuffer = await buildParchiPdfBuffer(job.halkaName, design, voters);

    const newProcessed = job.processedVoters + voters.length;
    const lastVoter = voterDocs[voterDocs.length - 1];
    const lastVoterId = String(lastVoter._id);
    const partIndex = job.outputFiles.length;

    const outputFile = await savePdfPart(
      job.halkaName,
      jobId,
      partIndex,
      pdfBuffer,
      voters.length,
      design.parchiPerPage
    );

    const outputFiles = [...job.outputFiles, outputFile];
    const isComplete = newProcessed >= job.totalVoters;

    await db.collection(JOBS_COLLECTION).updateOne(
      { _id: new ObjectId(jobId) },
      {
        $set: {
          processedVoters: newProcessed,
          lastVoterId,
          outputFiles,
          currentPartIndex: partIndex + 1,
          currentPartVoterCount: 0,
          status: isComplete ? 'completed' : 'running',
          completedAt: isComplete ? new Date() : null,
          error: null,
          updatedAt: new Date(),
        },
      }
    );

    return await getParchiJob(jobId, db);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Parchi generation failed';
    console.error('Parchi batch failed:', error);
    try {
      await db.collection(JOBS_COLLECTION).updateOne(
        { _id: new ObjectId(jobId) },
        { $set: { status: 'failed', error: message, updatedAt: new Date() } }
      );
      return await getParchiJob(jobId, db);
    } catch (updateError) {
      console.error('Failed to persist parchi job error:', updateError);
      return null;
    }
  } finally {
    await client.close();
  }
}
