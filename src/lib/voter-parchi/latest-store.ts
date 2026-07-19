import fs from 'fs/promises';
import path from 'path';
import { ObjectId, type Db } from 'mongodb';
import { PDFDocument } from 'pdf-lib';
import { connectNativeMongoClient } from '@/lib/mongo-client';
import { uploadBufferToFirebaseStorage } from '@/lib/firebase-storage';
import { readStorageBackedPdfBuffer } from '@/lib/voter-parchi/parchi-file-storage';

export type ParchiLatestSource = 'web' | 'cli';
export type ParchiLatestGender = 'both' | 'male' | 'female';

export interface ParchiLatestRecord {
  _id?: string;
  halkaName: string;
  blockCode: string;
  fileName: string;
  localPath: string;
  storagePath: string;
  downloadUrl: string;
  voterCount: number;
  pageCount: number;
  sizeBytes: number;
  source: ParchiLatestSource;
  jobId: string;
  designId?: string | null;
  genderFilter?: ParchiLatestGender | null;
  generatedAt: Date;
  updatedAt: Date;
}

const COLLECTION = 'voter_parchi_latest';

function normalizeHalka(halkaName: string): string {
  return halkaName.replace(/\s+/g, '').toUpperCase();
}

function normalizeBlockCodeKey(blockCode: string): string {
  const digits = String(blockCode ?? '').replace(/\D/g, '');
  if (!digits) return String(blockCode).trim();
  if (digits.length <= 7) return digits.padStart(7, '0');
  return digits;
}

function normalizeGenderKey(genderFilter?: ParchiLatestGender | null): ParchiLatestGender {
  if (genderFilter === 'male' || genderFilter === 'female') return genderFilter;
  return 'both';
}

function blockCodeLookupVariants(blockCode: string): string[] {
  const digits = String(blockCode ?? '').replace(/\D/g, '');
  if (!digits) {
    const raw = String(blockCode).trim();
    return raw ? [raw] : [];
  }
  const variants = new Set<string>();
  variants.add(digits);
  variants.add(digits.replace(/^0+/, '') || digits);
  if (digits.length <= 7) {
    variants.add(digits.padStart(7, '0'));
  }
  variants.add(normalizeBlockCodeKey(blockCode));
  return Array.from(variants);
}

function getLatestRoot(): string {
  return path.join(process.cwd(), 'data', 'voter-parchi-latest');
}

function genderFileSuffix(genderKey: ParchiLatestGender): string {
  return genderKey === 'both' ? '' : `-${genderKey}`;
}

export function getLatestParchiLocalPath(
  halkaName: string,
  blockCode: string,
  genderFilter?: ParchiLatestGender | null
): string {
  const halka = normalizeHalka(halkaName);
  const block = normalizeBlockCodeKey(blockCode);
  const genderKey = normalizeGenderKey(genderFilter);
  return path.join(getLatestRoot(), halka, `${block}${genderFileSuffix(genderKey)}.pdf`);
}

export function buildLatestParchiDownloadUrl(
  halkaName: string,
  blockCode: string,
  genderFilter?: ParchiLatestGender | null
): string {
  const params = new URLSearchParams({
    halkaName: normalizeHalka(halkaName),
    blockCode: normalizeBlockCodeKey(blockCode),
  });
  const genderKey = normalizeGenderKey(genderFilter);
  if (genderKey !== 'both') {
    params.set('genderFilter', genderKey);
  }
  return `/api/voter-parchi/latest/download/?${params.toString()}`;
}

async function mergePdfPaths(filePaths: string[]): Promise<Buffer> {
  if (filePaths.length === 1) {
    return fs.readFile(filePaths[0]);
  }
  const merged = await PDFDocument.create();
  for (const filePath of filePaths) {
    const bytes = await fs.readFile(filePath);
    const source = await PDFDocument.load(bytes);
    const pages = await merged.copyPages(source, source.getPageIndices());
    for (const page of pages) {
      merged.addPage(page);
    }
  }
  return Buffer.from(await merged.save());
}

function toRecord(doc: Record<string, unknown>): ParchiLatestRecord {
  return {
    _id: doc._id ? String(doc._id) : undefined,
    halkaName: String(doc.halkaName ?? ''),
    blockCode: String(doc.blockCode ?? ''),
    fileName: String(doc.fileName ?? ''),
    localPath: String(doc.localPath ?? ''),
    storagePath: String(doc.storagePath ?? ''),
    downloadUrl: String(doc.downloadUrl ?? ''),
    voterCount: Number(doc.voterCount) || 0,
    pageCount: Number(doc.pageCount) || 0,
    sizeBytes: Number(doc.sizeBytes) || 0,
    source: (doc.source as ParchiLatestSource) ?? 'web',
    jobId: String(doc.jobId ?? ''),
    designId: doc.designId ? String(doc.designId) : null,
    genderFilter: (doc.genderFilter as ParchiLatestRecord['genderFilter']) ?? null,
    generatedAt: doc.generatedAt ? new Date(doc.generatedAt as string | Date) : new Date(),
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt as string | Date) : new Date(),
  };
}

export async function upsertLatestParchiPdf(input: {
  halkaName: string;
  blockCode: string;
  source: ParchiLatestSource;
  jobId: string;
  designId?: string | null;
  genderFilter?: ParchiLatestGender | null;
  sourcePaths: string[];
  voterCount: number;
  pageCount: number;
  skipRemoteUpload?: boolean;
}): Promise<ParchiLatestRecord | null> {
  const halkaName = normalizeHalka(input.halkaName);
  const blockKey = normalizeBlockCodeKey(input.blockCode);
  const genderKey = normalizeGenderKey(input.genderFilter);
  if (!halkaName || !blockKey || input.sourcePaths.length === 0) {
    return null;
  }

  const existingPaths: string[] = [];
  for (const sourcePath of input.sourcePaths) {
    try {
      await fs.access(sourcePath);
      existingPaths.push(sourcePath);
    } catch {
      // skip missing
    }
  }
  if (existingPaths.length === 0) {
    return null;
  }

  const buffer = await mergePdfPaths(existingPaths);
  const suffix = genderFileSuffix(genderKey);
  const fileName = `${halkaName}-${blockKey}${suffix}.pdf`;
  const localPath = getLatestParchiLocalPath(halkaName, blockKey, genderKey);
  await fs.mkdir(path.dirname(localPath), { recursive: true });
  await fs.writeFile(localPath, buffer);

  const localDownloadUrl = buildLatestParchiDownloadUrl(halkaName, blockKey, genderKey);
  let downloadUrl = localDownloadUrl;
  let storagePath = `local:${localPath}`;

  if (!input.skipRemoteUpload) {
    try {
      const firebasePath = `${halkaName}/voter-parchi-latest/${blockKey}${suffix}.pdf`;
      downloadUrl = await Promise.race([
        uploadBufferToFirebaseStorage(buffer, firebasePath, 'application/pdf'),
        new Promise<string>((_, reject) => {
          setTimeout(() => reject(new Error('Firebase upload timed out')), 45_000);
        }),
      ]);
      storagePath = firebasePath;
    } catch (error) {
      console.warn(
        'Firebase upload skipped for latest voter parchi; using local file.',
        error instanceof Error ? error.message : error
      );
    }
  }

  const now = new Date();
  const client = await connectNativeMongoClient();
  try {
    const db = client.db('vdp');
    await ensureLatestParchiIndexes(db);

    const existing =
      genderKey === 'both'
        ? await db.collection(COLLECTION).findOne({
            halkaName,
            blockCode: blockKey,
            $or: [{ genderFilter: 'both' }, { genderFilter: null }, { genderFilter: { $exists: false } }],
          })
        : await db.collection(COLLECTION).findOne({
            halkaName,
            blockCode: blockKey,
            genderFilter: genderKey,
          });

    const payload = {
      halkaName,
      blockCode: blockKey,
      fileName,
      localPath,
      storagePath,
      downloadUrl,
      voterCount: input.voterCount,
      pageCount: input.pageCount,
      sizeBytes: buffer.length,
      source: input.source,
      jobId: input.jobId,
      designId: input.designId ?? null,
      genderFilter: genderKey,
      generatedAt: now,
      updatedAt: now,
    };

    if (existing?._id) {
      await db.collection(COLLECTION).updateOne({ _id: existing._id }, { $set: payload });
    } else {
      await db.collection(COLLECTION).insertOne({ ...payload, createdAt: now });
    }

    const doc = await db.collection(COLLECTION).findOne({
      halkaName,
      blockCode: blockKey,
      genderFilter: genderKey,
    });
    return doc ? toRecord(doc as Record<string, unknown>) : null;
  } finally {
    await client.close();
  }
}

export async function getLatestParchi(
  halkaName: string,
  blockCode: string,
  db?: Db,
  genderFilter?: ParchiLatestGender | null
): Promise<ParchiLatestRecord | null> {
  const ownClient = db ? null : await connectNativeMongoClient();
  try {
    const database = db ?? ownClient!.db('vdp');
    const halka = normalizeHalka(halkaName);
    const genderKey = genderFilter ? normalizeGenderKey(genderFilter) : null;

    for (const variant of blockCodeLookupVariants(blockCode)) {
      if (genderKey) {
        const exact = await database.collection(COLLECTION).findOne({
          halkaName: halka,
          blockCode: variant,
          genderFilter: genderKey,
        });
        if (exact) return toRecord(exact as Record<string, unknown>);

        // Legacy combined PDF when asking for a specific gender and none exists yet.
        if (genderKey !== 'both') {
          const legacy = await database.collection(COLLECTION).findOne({
            halkaName: halka,
            blockCode: variant,
            $or: [{ genderFilter: 'both' }, { genderFilter: null }, { genderFilter: { $exists: false } }],
          });
          if (legacy) return toRecord(legacy as Record<string, unknown>);
        }
        continue;
      }

      const any = await database.collection(COLLECTION).findOne(
        { halkaName: halka, blockCode: variant },
        { sort: { updatedAt: -1 } }
      );
      if (any) return toRecord(any as Record<string, unknown>);
    }
    return null;
  } finally {
    if (ownClient) await ownClient.close();
  }
}

export async function listLatestParchiForBlock(
  halkaName: string,
  blockCode: string
): Promise<ParchiLatestRecord[]> {
  const client = await connectNativeMongoClient();
  try {
    const db = client.db('vdp');
    const halka = normalizeHalka(halkaName);
    const variants = blockCodeLookupVariants(blockCode);
    const docs = await db
      .collection(COLLECTION)
      .find({ halkaName: halka, blockCode: { $in: variants } })
      .sort({ genderFilter: 1, updatedAt: -1 })
      .toArray();
    return docs.map((doc) => toRecord(doc as Record<string, unknown>));
  } finally {
    await client.close();
  }
}

export async function listLatestParchiForHalka(halkaName: string): Promise<ParchiLatestRecord[]> {
  const client = await connectNativeMongoClient();
  try {
    const db = client.db('vdp');
    const docs = await db
      .collection(COLLECTION)
      .find({ halkaName: normalizeHalka(halkaName) })
      .sort({ blockCode: 1, genderFilter: 1 })
      .toArray();
    return docs.map((doc) => toRecord(doc as Record<string, unknown>));
  } finally {
    await client.close();
  }
}

export async function readLatestParchiFile(
  halkaName: string,
  blockCode: string,
  genderFilter?: ParchiLatestGender | null
): Promise<{ record: ParchiLatestRecord; buffer: Buffer } | null> {
  const record = await getLatestParchi(halkaName, blockCode, undefined, genderFilter);
  if (!record) return null;

  const buffer = await readStorageBackedPdfBuffer({
    localPath: record.localPath,
    fallbackLocalPath: getLatestParchiLocalPath(halkaName, blockCode, record.genderFilter ?? genderFilter),
    storagePath: record.storagePath,
    downloadUrl: record.downloadUrl,
  });

  if (!buffer) {
    return { record, buffer: Buffer.alloc(0) };
  }

  return { record, buffer };
}

/** Ensure unique index exists (safe to call repeatedly). */
export async function ensureLatestParchiIndexes(db?: Db): Promise<void> {
  const ownClient = db ? null : await connectNativeMongoClient();
  try {
    const database = db ?? ownClient!.db('vdp');
    try {
      await database.collection(COLLECTION).dropIndex('halka_block_unique');
    } catch {
      // index may not exist
    }
    await database.collection(COLLECTION).createIndex(
      { halkaName: 1, blockCode: 1, genderFilter: 1 },
      { unique: true, name: 'halka_block_gender_unique', sparse: true }
    );
  } finally {
    if (ownClient) await ownClient.close();
  }
}

export function isObjectIdString(value: string): boolean {
  return ObjectId.isValid(value);
}
