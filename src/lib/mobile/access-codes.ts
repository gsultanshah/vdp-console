import crypto from 'crypto';
import { ObjectId, type Db } from 'mongodb';
import type { MobileAccessCode, MobileAccessCodeBranding } from '@/lib/mobile/types';

const ACCESS_CODES_COLLECTION = 'mobile_access_codes';

export interface MobileAccessCodeContactFields {
  name?: string;
  phone?: string;
  address?: string;
  comments?: string;
}

function normalizeHalka(halkaName: string): string {
  return halkaName.replace(/\s+/g, '').toUpperCase();
}

function normalizeContactFields(input?: MobileAccessCodeContactFields): MobileAccessCodeContactFields {
  return {
    name: input?.name?.trim() || undefined,
    phone: input?.phone?.trim() || undefined,
    address: input?.address?.trim() || undefined,
    comments: input?.comments?.trim() || undefined,
  };
}

function toAccessCode(doc: Record<string, unknown>): MobileAccessCode {
  return {
    _id: String(doc._id),
    code: String(doc.code ?? ''),
    label: String(doc.label ?? ''),
    name: doc.name ? String(doc.name) : undefined,
    phone: doc.phone ? String(doc.phone) : undefined,
    address: doc.address ? String(doc.address) : undefined,
    comments: doc.comments ? String(doc.comments) : undefined,
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

async function generateAvailableCode(db: Db, preferred?: string): Promise<string> {
  let code = preferred?.replace(/\D/g, '').padStart(6, '0').slice(-6) ?? '';

  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (!code || attempt > 0) {
      code = generateUniqueCode();
    }
    const exists = await db.collection(ACCESS_CODES_COLLECTION).findOne({ code });
    if (!exists) return code;
    code = '';
  }

  throw new Error('Could not generate a unique 6-digit code. Try again.');
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
    name?: string;
    phone?: string;
    address?: string;
    comments?: string;
  },
): Promise<MobileAccessCode> {
  const halkaName = normalizeHalka(input.halkaName);
  const contact = normalizeContactFields(input);
  const code = await generateAvailableCode(db, input.code);
  const label = input.label.trim() || contact.name || `${halkaName} field access`;

  const doc = {
    code,
    label,
    ...contact,
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
    name: string;
    phone: string;
    address: string;
    comments: string;
  }>,
): Promise<MobileAccessCode | null> {
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.label != null) update.label = patch.label.trim();
  if (patch.active != null) update.active = patch.active;
  if (patch.branding != null) update.branding = patch.branding;
  if (patch.name != null) update.name = patch.name.trim();
  if (patch.phone != null) update.phone = patch.phone.trim();
  if (patch.address != null) update.address = patch.address.trim();
  if (patch.comments != null) update.comments = patch.comments.trim();

  const result = await db
    .collection(ACCESS_CODES_COLLECTION)
    .findOneAndUpdate({ _id: new ObjectId(id) }, { $set: update }, { returnDocument: 'after' });

  return result ? toAccessCode(result as Record<string, unknown>) : null;
}

export async function touchAccessCodeUsage(db: Db, code: string): Promise<void> {
  await db.collection(ACCESS_CODES_COLLECTION).updateOne(
    { code },
    { $set: { lastUsedAt: new Date(), updatedAt: new Date() } },
  );
}

export interface BulkCreateAccessCodesResult {
  created: MobileAccessCode[];
  errors: string[];
}

export async function bulkCreateAccessCodes(
  db: Db,
  rows: Array<{
    halkaName: string;
    label: string;
    name?: string;
    phone?: string;
    address?: string;
    comments?: string;
    branding?: MobileAccessCodeBranding;
  }>,
  createdBy: string,
  createdByName: string,
): Promise<BulkCreateAccessCodesResult> {
  const created: MobileAccessCode[] = [];
  const errors: string[] = [];

  for (let index = 0; index < rows.length; index += 1) {
    try {
      const code = await createAccessCode(db, {
        ...rows[index],
        createdBy,
        createdByName,
      });
      created.push(code);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create code';
      errors.push(`Row ${index + 2}: ${message}`);
    }
  }

  return { created, errors };
}
