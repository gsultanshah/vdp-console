import crypto from 'crypto';
import { ObjectId, type Db } from 'mongodb';
import type { MobileAccessCode, MobileAccessCodeBranding } from '@/lib/mobile/types';

const ACCESS_CODES_COLLECTION = 'mobile_access_codes';

function normalizeHalka(halkaName: string): string {
  return halkaName.replace(/\s+/g, '').toUpperCase();
}

function toAccessCode(doc: Record<string, unknown>): MobileAccessCode {
  return {
    _id: String(doc._id),
    code: String(doc.code ?? ''),
    label: String(doc.label ?? ''),
    halkaName: String(doc.halkaName ?? ''),
    active: doc.active !== false,
    branding: (doc.branding as MobileAccessCodeBranding) ?? {},
    createdBy: String(doc.createdBy ?? ''),
    createdByName: String(doc.createdByName ?? ''),
    createdAt: doc.createdAt ? new Date(doc.createdAt as string | Date) : undefined,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt as string | Date) : undefined,
    lastUsedAt: doc.lastUsedAt ? new Date(doc.lastUsedAt as string | Date) : null,
  };
}

function generateUniqueCode(): string {
  return String(crypto.randomInt(100000, 1000000));
}

export async function listAccessCodes(db: Db, halkaName?: string): Promise<MobileAccessCode[]> {
  const filter = halkaName ? { halkaName: normalizeHalka(halkaName) } : {};
  const docs = await db
    .collection(ACCESS_CODES_COLLECTION)
    .find(filter)
    .sort({ createdAt: -1 })
    .toArray();
  return docs.map((doc) => toAccessCode(doc as Record<string, unknown>));
}

export async function getAccessCodeByCode(db: Db, code: string): Promise<MobileAccessCode | null> {
  const normalized = code.replace(/\D/g, '').padStart(6, '0').slice(-6);
  const doc = await db.collection(ACCESS_CODES_COLLECTION).findOne({ code: normalized, active: true });
  return doc ? toAccessCode(doc as Record<string, unknown>) : null;
}

export async function createAccessCode(
  db: Db,
  input: {
    halkaName: string;
    label: string;
    branding?: MobileAccessCodeBranding;
    createdBy: string;
    createdByName: string;
    code?: string;
  }
): Promise<MobileAccessCode> {
  const halkaName = normalizeHalka(input.halkaName);
  let code = input.code?.replace(/\D/g, '').padStart(6, '0').slice(-6) ?? '';

  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (!code || attempt > 0) {
      code = generateUniqueCode();
    }
    const exists = await db.collection(ACCESS_CODES_COLLECTION).findOne({ code });
    if (!exists) break;
    code = '';
  }

  if (!code) {
    throw new Error('Could not generate a unique 6-digit code. Try again.');
  }

  const doc = {
    code,
    label: input.label.trim() || `${halkaName} field access`,
    halkaName,
    active: true,
    branding: input.branding ?? {},
    createdBy: input.createdBy,
    createdByName: input.createdByName,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastUsedAt: null,
  };

  const result = await db.collection(ACCESS_CODES_COLLECTION).insertOne(doc);
  return toAccessCode({ ...doc, _id: result.insertedId } as Record<string, unknown>);
}

export async function updateAccessCode(
  db: Db,
  id: string,
  patch: Partial<{
    label: string;
    active: boolean;
    branding: MobileAccessCodeBranding;
  }>
): Promise<MobileAccessCode | null> {
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.label != null) update.label = patch.label.trim();
  if (patch.active != null) update.active = patch.active;
  if (patch.branding != null) update.branding = patch.branding;

  const result = await db
    .collection(ACCESS_CODES_COLLECTION)
    .findOneAndUpdate({ _id: new ObjectId(id) }, { $set: update }, { returnDocument: 'after' });

  return result ? toAccessCode(result as Record<string, unknown>) : null;
}

export async function touchAccessCodeUsage(db: Db, code: string): Promise<void> {
  await db.collection(ACCESS_CODES_COLLECTION).updateOne(
    { code },
    { $set: { lastUsedAt: new Date(), updatedAt: new Date() } }
  );
}
