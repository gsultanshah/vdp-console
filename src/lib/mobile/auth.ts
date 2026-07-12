import crypto from 'crypto';
import { ObjectId, type Db } from 'mongodb';
import type { SessionUser } from '@/lib/auth';
import { getAccessCodeByCode, touchAccessCodeUsage } from '@/lib/mobile/access-codes';
import { resolveBrandingForAccessCode } from '@/lib/mobile/branding';
import type { MobileSession } from '@/lib/mobile/types';

const SESSIONS_COLLECTION = 'mobile_sessions';
const SESSION_TTL_DAYS = 30;

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function sessionExpiry(): Date {
  const date = new Date();
  date.setDate(date.getDate() + SESSION_TTL_DAYS);
  return date;
}

function toSession(doc: Record<string, unknown>): MobileSession {
  return {
    _id: String(doc._id),
    token: String(doc.token),
    type: doc.type === 'admin' ? 'admin' : 'user',
    accessCode: doc.accessCode ? String(doc.accessCode) : undefined,
    halkaName: doc.halkaName ? String(doc.halkaName) : undefined,
    userId: doc.userId ? String(doc.userId) : undefined,
    userEmail: doc.userEmail ? String(doc.userEmail) : undefined,
    userName: doc.userName ? String(doc.userName) : undefined,
    expiresAt: new Date(doc.expiresAt as string | Date),
    createdAt: new Date(doc.createdAt as string | Date),
  };
}

export async function createUserSessionFromCode(
  db: Db,
  code: string
): Promise<{
  session: MobileSession;
  halkaName: string;
  label: string;
  branding: Awaited<ReturnType<typeof resolveBrandingForAccessCode>>;
} | null> {
  const accessCode = await getAccessCodeByCode(db, code);
  if (!accessCode || !accessCode.active) return null;

  const branding = await resolveBrandingForAccessCode(db, accessCode.halkaName, accessCode.branding);
  const token = generateToken();
  const doc = {
    token,
    type: 'user' as const,
    accessCode: accessCode.code,
    halkaName: accessCode.halkaName,
    expiresAt: sessionExpiry(),
    createdAt: new Date(),
  };

  const result = await db.collection(SESSIONS_COLLECTION).insertOne(doc);
  await touchAccessCodeUsage(db, accessCode.code);

  return {
    session: toSession({ ...doc, _id: result.insertedId } as Record<string, unknown>),
    halkaName: accessCode.halkaName,
    label: accessCode.label,
    branding,
  };
}

export async function createAdminSession(
  db: Db,
  user: SessionUser
): Promise<MobileSession> {
  const token = generateToken();
  const doc = {
    token,
    type: 'admin' as const,
    userId: user._id,
    userEmail: user.email,
    userName: user.name,
    expiresAt: sessionExpiry(),
    createdAt: new Date(),
  };
  const result = await db.collection(SESSIONS_COLLECTION).insertOne(doc);
  return toSession({ ...doc, _id: result.insertedId } as Record<string, unknown>);
}

export async function getSessionByToken(db: Db, token: string): Promise<MobileSession | null> {
  const doc = await db.collection(SESSIONS_COLLECTION).findOne({
    token,
    expiresAt: { $gt: new Date() },
  });
  return doc ? toSession(doc as Record<string, unknown>) : null;
}

export function getBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

export async function resolveMobileSession(request: Request, db: Db): Promise<MobileSession | null> {
  const token = getBearerToken(request);
  if (!token) return null;
  return getSessionByToken(db, token);
}

export async function revokeSession(db: Db, token: string): Promise<void> {
  await db.collection(SESSIONS_COLLECTION).deleteOne({ token });
}
