import fs from 'fs/promises';
import path from 'path';
import { ObjectId, type Db } from 'mongodb';
import { PDFDocument } from 'pdf-lib';
import { connectNativeMongoClient } from '@/lib/mongo-client';
import { uploadBufferToFirebaseStorage } from '@/lib/firebase-storage';

export type ParchiLatestSource = 'web' | 'cli';

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
  genderFilter?: 'both' | 'male' | 'female' | null;
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
  // Keep a stable 7-digit form when possible (ECP electoral roll codes).
  if (digits.length <= 7) return digits.padStart(7, '0');
  return digits;
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

export function getLatestParchiLocalPath(halkaName: string, blockCode: string): string {
  const halka = normalizeHalka(halkaName);
  const block = normalizeBlockCodeKey(blockCode);
  return path.join(getLatestRoot(), halka, `${block}.pdf`);
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
  genderFilter?: 'both' | 'male' | 'female' | null;
  sourcePaths: string[];
  voterCount: number;
  pageCount: number;
  skipRemoteUpload?: boolean;
}): Promise<ParchiLatestRecord | null> {
  const halkaName = normalizeHalka(input.halkaName);
  const blockKey = normalizeBlockCodeKey(input.blockCode);
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
  const fileName = `${halkaName}-${blockKey}.pdf`;
  const localPath = getLatestParchiLocalPath(halkaName, blockKey);
  await fs.mkdir(path.dirname(localPath), { recursive: true });
  await fs.writeFile(localPath, buffer);

  const localDownloadUrl = `/api/voter-parchi/latest/download?halkaName=${encodeURIComponent(halkaName)}&blockCode=${encodeURIComponent(blockKey)}`;
  let downloadUrl = localDownloadUrl;
  let storagePath = `local:${localPath}`;

  if (!input.skipRemoteUpload) {
    try {
      const firebasePath = `${halkaName}/voter-parchi-latest/${blockKey}.pdf`;
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
    await db.collection(COLLECTION).updateOne(
      { halkaName, blockCode: blockKey },
      {
        $set: {
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
          genderFilter: input.genderFilter ?? null,
          generatedAt: now,
          updatedAt: now,
        },
        $setOnInsert: {
          createdAt: now,
        },
      },
      { upsert: true }
    );

    const doc = await db.collection(COLLECTION).findOne({ halkaName, blockCode: blockKey });
    return doc ? toRecord(doc as Record<string, unknown>) : null;
  } finally {
    await client.close();
  }
}

export async function getLatestParchi(
  halkaName: string,
  blockCode: string,
  db?: Db
): Promise<ParchiLatestRecord | null> {
  const ownClient = db ? null : await connectNativeMongoClient();
  try {
    const database = db ?? ownClient!.db('vdp');
    const halka = normalizeHalka(halkaName);
    for (const variant of blockCodeLookupVariants(blockCode)) {
      const doc = await database.collection(COLLECTION).findOne({
        halkaName: halka,
        blockCode: variant,
      });
      if (doc) return toRecord(doc as Record<string, unknown>);
    }
    return null;
  } finally {
    if (ownClient) await ownClient.close();
  }
}

export async function listLatestParchiForHalka(
  halkaName: string
): Promise<ParchiLatestRecord[]> {
  const client = await connectNativeMongoClient();
  try {
    const db = client.db('vdp');
    const docs = await db
      .collection(COLLECTION)
      .find({ halkaName: normalizeHalka(halkaName) })
      .sort({ blockCode: 1 })
      .toArray();
    return docs.map((doc) => toRecord(doc as Record<string, unknown>));
  } finally {
    await client.close();
  }
}

export async function readLatestParchiFile(
  halkaName: string,
  blockCode: string
): Promise<{ record: ParchiLatestRecord; buffer: Buffer } | null> {
  const record = await getLatestParchi(halkaName, blockCode);
  if (!record) return null;

  try {
    if (record.localPath) {
      const buffer = await fs.readFile(record.localPath);
      return { record, buffer };
    }
  } catch {
    // fall through
  }

  const fallback = getLatestParchiLocalPath(halkaName, blockCode);
  try {
    const buffer = await fs.readFile(fallback);
    return { record: { ...record, localPath: fallback }, buffer };
  } catch {
    return { record, buffer: Buffer.alloc(0) };
  }
}

/** Ensure unique index exists (safe to call repeatedly). */
export async function ensureLatestParchiIndexes(): Promise<void> {
  const client = await connectNativeMongoClient();
  try {
    const db = client.db('vdp');
    await db.collection(COLLECTION).createIndex(
      { halkaName: 1, blockCode: 1 },
      { unique: true, name: 'halka_block_unique' }
    );
  } finally {
    await client.close();
  }
}

export function isObjectIdString(value: string): boolean {
  return ObjectId.isValid(value);
}
