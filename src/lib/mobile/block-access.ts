import type { MobileAccessCode } from '@/lib/mobile/types';

export const MAX_MOBILE_ACCESS_BLOCK_CODES = 100;

export function normalizeBlockCodeValue(value: string): string {
  return String(value ?? '').trim();
}

export function normalizeAllowedBlockCodes(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const unique = new Set<string>();
  for (const value of values) {
    const code = normalizeBlockCodeValue(String(value ?? ''));
    if (code) {
      unique.add(code);
    }
  }
  return Array.from(unique).sort();
}

export function validateBlockCodesLimit(blockCodes: string[]): void {
  if (blockCodes.length > MAX_MOBILE_ACCESS_BLOCK_CODES) {
    throw new Error(
      `A mobile login can have at most ${MAX_MOBILE_ACCESS_BLOCK_CODES} block codes (${blockCodes.length} provided).`
    );
  }
}

export function accessAllowsAllBlockCodes(
  access: Pick<MobileAccessCode, 'selectAllBlockCodes' | 'blockCodes'> | null | undefined
): boolean {
  if (!access) {
    return true;
  }
  return access.selectAllBlockCodes !== false;
}

export function getAllowedBlockCodes(
  access: Pick<MobileAccessCode, 'selectAllBlockCodes' | 'blockCodes'> | null | undefined
): string[] {
  if (accessAllowsAllBlockCodes(access)) {
    return [];
  }
  return normalizeAllowedBlockCodes(access?.blockCodes ?? []);
}

export function blockCodeVariants(code: string): string[] {
  const trimmed = normalizeBlockCodeValue(code);
  if (!trimmed) {
    return [];
  }

  const variants = new Set<string>([trimmed]);
  const digits = trimmed.replace(/\D/g, '');
  if (digits) {
    variants.add(digits);
    variants.add(digits.padStart(7, '0'));
  }
  return Array.from(variants);
}

export function isBlockCodeAllowed(
  access: Pick<MobileAccessCode, 'selectAllBlockCodes' | 'blockCodes'> | null | undefined,
  blockCode: string
): boolean {
  if (accessAllowsAllBlockCodes(access)) {
    return true;
  }

  const allowed = getAllowedBlockCodes(access);
  if (allowed.length === 0) {
    return false;
  }

  const requested = new Set(blockCodeVariants(blockCode));
  return allowed.some((code) => blockCodeVariants(code).some((variant) => requested.has(variant)));
}

export function filterAllowedBlockCodes<T extends { blockCode: string }>(
  access: Pick<MobileAccessCode, 'selectAllBlockCodes' | 'blockCodes'> | null | undefined,
  blocks: T[]
): T[] {
  if (accessAllowsAllBlockCodes(access)) {
    return blocks;
  }
  return blocks.filter((block) => isBlockCodeAllowed(access, block.blockCode));
}

export function resolveSearchBlockFilter(
  access: Pick<MobileAccessCode, 'selectAllBlockCodes' | 'blockCodes'> | null | undefined,
  requestedBlockCode?: string
): { selectAll: boolean; blockCodes: string[]; forbidden: boolean } {
  const allowed = getAllowedBlockCodes(access);
  const selectAll = accessAllowsAllBlockCodes(access);

  if (requestedBlockCode?.trim()) {
    if (!isBlockCodeAllowed(access, requestedBlockCode)) {
      return { selectAll: false, blockCodes: [], forbidden: true };
    }
    return { selectAll: false, blockCodes: [requestedBlockCode.trim()], forbidden: false };
  }

  if (selectAll) {
    return { selectAll: true, blockCodes: [], forbidden: false };
  }

  return { selectAll: false, blockCodes: allowed, forbidden: allowed.length === 0 };
}
