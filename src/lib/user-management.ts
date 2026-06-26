import { resolveConstituencyAccessValue } from '@/lib/constituency-access';

export const ALL_CONSTITUENCIES = 'all';

export interface UserDocumentFields {
  _id: unknown;
  name?: string;
  email?: string;
  password?: string;
  role?: string;
  constituencyAccess?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export function formatUser(user: UserDocumentFields) {
  return {
    _id: String(user._id),
    name: user.name ?? '',
    email: user.email ?? '',
    password: user.password ?? '',
    role: user.role ?? 'user',
    constituencyAccess: user.constituencyAccess ?? ALL_CONSTITUENCIES,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function isAdminRole(role: string | undefined | null): boolean {
  return role === 'admin';
}

export function normalizeConstituencyAccess(
  value: string | undefined | null,
  validHalkaNames: string[]
): string | null {
  return resolveConstituencyAccessValue(value, validHalkaNames);
}

function pickField(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const match = Object.keys(row).find(
      (column) => column.trim().toLowerCase() === key.toLowerCase()
    );
    if (!match) {
      continue;
    }
    const value = row[match];
    if (value != null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return '';
}

export interface ParsedImportUserRow {
  rowNumber: number;
  name: string;
  email: string;
  password: string;
  role: 'user' | 'admin';
  constituencyAccess: string;
}

export function parseImportUserRow(
  row: Record<string, unknown>,
  rowNumber: number,
  defaultConstituencyAccess: string,
  validHalkaNames: string[]
): { ok: true; user: ParsedImportUserRow } | { ok: false; error: string } {
  const name = pickField(row, ['name']);
  const email = pickField(row, ['email']);
  const password = pickField(row, ['password']);
  const roleValue = pickField(row, ['role']).toLowerCase() || 'user';
  const constituencyValue =
    pickField(row, ['constituency', 'constituencyaccess', 'halka', 'halkaname']) ||
    defaultConstituencyAccess;

  if (!name || !email || !password) {
    return {
      ok: false,
      error: `Row ${rowNumber}: name, email, and password are required`,
    };
  }

  if (!['user', 'admin'].includes(roleValue)) {
    return {
      ok: false,
      error: `Row ${rowNumber}: role must be user or admin`,
    };
  }

  const constituencyAccess = normalizeConstituencyAccess(constituencyValue, validHalkaNames);
  if (!constituencyAccess) {
    return {
      ok: false,
      error: `Row ${rowNumber}: invalid constituency "${constituencyValue}"`,
    };
  }

  return {
    ok: true,
    user: {
      rowNumber,
      name,
      email: email.toLowerCase(),
      password,
      role: roleValue as 'user' | 'admin',
      constituencyAccess: roleValue === 'admin' ? ALL_CONSTITUENCIES : constituencyAccess,
    },
  };
}

export function resolveConstituencyAccessForSave(
  role: string,
  constituencyAccess: string | undefined | null,
  validHalkaNames: string[]
): string | null {
  if (isAdminRole(role)) {
    return ALL_CONSTITUENCIES;
  }
  return normalizeConstituencyAccess(constituencyAccess, validHalkaNames);
}
