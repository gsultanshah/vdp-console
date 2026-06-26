import { ALL_CONSTITUENCIES } from '@/lib/user-management';

export interface ConstituencyAccessUser {
  role?: string;
  constituencyAccess?: string | null;
}

export function hasAllConstituencyAccess(user: ConstituencyAccessUser | null | undefined): boolean {
  if (!user) {
    return true;
  }
  if (user.role === 'admin') {
    return true;
  }
  const access = (user.constituencyAccess ?? ALL_CONSTITUENCIES).trim().toLowerCase();
  return access === ALL_CONSTITUENCIES;
}

export function normalizeHalkaForCompare(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

export function canAccessHalka(
  user: ConstituencyAccessUser | null | undefined,
  halkaName: string
): boolean {
  if (!user || hasAllConstituencyAccess(user)) {
    return true;
  }
  return normalizeHalkaForCompare(user.constituencyAccess ?? '') === normalizeHalkaForCompare(halkaName);
}

export function matchConstituencyName(
  value: string,
  validHalkaNames: string[]
): string | null {
  const normalized = normalizeHalkaForCompare(value);
  return validHalkaNames.find((name) => normalizeHalkaForCompare(name) === normalized) ?? null;
}

export function resolveConstituencyAccessValue(
  value: string | undefined | null,
  validHalkaNames: string[]
): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.toLowerCase() === ALL_CONSTITUENCIES) {
    return ALL_CONSTITUENCIES;
  }
  return matchConstituencyName(trimmed, validHalkaNames);
}

export function getAllowedHalkaName(user: ConstituencyAccessUser | null | undefined): string | null {
  if (!user || hasAllConstituencyAccess(user)) {
    return null;
  }
  return user.constituencyAccess?.trim() || null;
}

export function buildHalkaFilter(
  user: ConstituencyAccessUser | null | undefined
): Record<string, string> | Record<string, never> {
  const halkaName = getAllowedHalkaName(user);
  if (!halkaName) {
    return {};
  }
  return { halkaName };
}
