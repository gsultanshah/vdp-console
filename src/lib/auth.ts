import { NextResponse } from 'next/server';

export interface SessionUser {
  _id: string;
  name: string;
  email: string;
  role: string;
  constituencyAccess?: string;
}

export function canManageUsers(role: string | undefined | null): boolean {
  return Boolean(role && role !== 'user');
}

export function getUserFromRequest(request: Request): SessionUser | null {
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(/(?:^|;\s*)user=([^;]+)/);
  if (!match) {
    return null;
  }

  const rawValue = match[1];

  try {
    const parsed = JSON.parse(decodeURIComponent(rawValue)) as SessionUser;
    if (!parsed?.email || !parsed?.role) {
      return null;
    }
    return parsed;
  } catch {
    try {
      const parsed = JSON.parse(rawValue) as SessionUser;
      if (!parsed?.email || !parsed?.role) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export function forbiddenResponse() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

export function requireUserManager(request: Request): SessionUser | null {
  const user = getUserFromRequest(request);
  if (!user || !canManageUsers(user.role)) {
    return null;
  }
  return user;
}
