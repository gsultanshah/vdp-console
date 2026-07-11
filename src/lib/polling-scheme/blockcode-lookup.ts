import type { Db } from 'mongodb';
import { genderFromCnic } from '@/lib/cnic';

/** Polling scheme stores electoral roll codes without leading zeros (e.g. 70001). */
export function canonicalPollingBlockcode(blockCode: string | number): number | null {
  const digits = String(blockCode ?? '').replace(/\D/g, '');
  if (!digits) return null;
  const value = Number.parseInt(digits, 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Ordered variants: canonical numeric first, then unpadded/padded string forms. */
export function pollingBlockcodeLookupVariants(blockCode: string | number): Array<number | string> {
  const digits = String(blockCode ?? '').replace(/\D/g, '');
  if (!digits) return [];

  const ordered: Array<number | string> = [];
  const seen = new Set<string>();

  const push = (value: number | string) => {
    const key = `${typeof value}:${value}`;
    if (seen.has(key)) return;
    seen.add(key);
    ordered.push(value);
  };

  const canonical = Number.parseInt(digits, 10);
  if (Number.isFinite(canonical) && canonical > 0) {
    push(canonical);
  }

  const unpadded = digits.replace(/^0+/, '') || digits;
  push(unpadded);
  push(digits);

  return ordered;
}

export function normalizePollingSchemeHalka(halkaName: string): string {
  return halkaName.replace(/\s+/g, '').toUpperCase();
}

function buildHalkaFilter(halkaName: string): Record<string, unknown> {
  const normalized = normalizePollingSchemeHalka(halkaName);
  const trimmed = halkaName.trim();
  return normalized === trimmed ? { halkaName: normalized } : { halkaName: { $in: [normalized, trimmed] } };
}

export function normalizePollingType(gender: string, cnic: string): 'male' | 'female' {
  const fromCnic = genderFromCnic(cnic);
  if (fromCnic) return fromCnic;

  const lower = gender.toLowerCase();
  if (lower.includes('female') || lower.includes('خواتین') || lower.includes('عورت')) {
    return 'female';
  }
  return 'male';
}

export async function findPollingSchemeDoc(
  db: Db,
  input: {
    halkaName: string;
    blockCode: string | number;
    type?: 'male' | 'female' | 'combined';
  }
): Promise<Record<string, unknown> | null> {
  const canonical = canonicalPollingBlockcode(input.blockCode);
  if (!canonical) return null;

  const halkaFilter = buildHalkaFilter(input.halkaName);
  const typeFilter = input.type ? { type: input.type } : {};
  const collection = db.collection('polling_scheme');

  let doc = await collection.findOne({
    ...halkaFilter,
    ...typeFilter,
    blockcode: canonical,
  });
  if (doc) return doc as Record<string, unknown>;

  for (const variant of pollingBlockcodeLookupVariants(input.blockCode)) {
    if (variant === canonical) continue;
    doc = await collection.findOne({
      ...halkaFilter,
      ...typeFilter,
      blockcode: variant,
    });
    if (doc) return doc as Record<string, unknown>;
  }

  doc = await collection.findOne({
    ...halkaFilter,
    ...typeFilter,
    $expr: {
      $eq: [
        {
          $convert: {
            input: '$blockcode',
            to: 'int',
            onError: 0,
            onNull: 0,
          },
        },
        canonical,
      ],
    },
  });

  return doc ? (doc as Record<string, unknown>) : null;
}

export async function findPollingSchemeForVoter(
  db: Db,
  input: {
    halkaName: string;
    blockCode: string | number;
    gender?: string;
    cnic?: string;
  }
): Promise<Record<string, unknown> | null> {
  const pollingType = normalizePollingType(String(input.gender ?? ''), String(input.cnic ?? ''));
  const typesToTry: Array<'male' | 'female' | 'combined' | undefined> = [pollingType, 'combined', undefined];

  for (const type of typesToTry) {
    const doc = await findPollingSchemeDoc(db, {
      halkaName: input.halkaName,
      blockCode: input.blockCode,
      type,
    });
    if (doc) return doc;
  }

  return null;
}
