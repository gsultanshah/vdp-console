import type { SessionUser } from '@/lib/auth';
import { ALL_CONSTITUENCIES } from '@/lib/user-management';

export interface PublicUserProfile {
  _id: string;
  name: string;
  email: string;
  role: string;
  constituencyAccess: string;
  createdAt?: string;
  updatedAt?: string;
}

export function toPublicUserProfile(user: {
  _id: unknown;
  name?: string;
  email?: string;
  role?: string;
  constituencyAccess?: string;
  createdAt?: Date;
  updatedAt?: Date;
}): PublicUserProfile {
  return {
    _id: String(user._id),
    name: user.name ?? '',
    email: user.email ?? '',
    role: user.role ?? 'user',
    constituencyAccess: user.constituencyAccess ?? ALL_CONSTITUENCIES,
    createdAt: user.createdAt?.toISOString(),
    updatedAt: user.updatedAt?.toISOString(),
  };
}

export function toSessionUser(user: PublicUserProfile): SessionUser {
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    constituencyAccess: user.constituencyAccess,
  };
}

export function buildSessionCookieHeader(sessionUser: SessionUser): string {
  return `user=${encodeURIComponent(JSON.stringify(sessionUser))}; Path=/; HttpOnly; SameSite=Strict`;
}
