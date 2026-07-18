import type { Db } from 'mongodb';
import { createDefaultDesign } from '@/lib/voter-parchi/defaults';
import { getDesignById } from '@/lib/voter-parchi/job-service';
import type { MobileAccessCode } from '@/lib/mobile/types';

function normalizeHalka(halkaName: string): string {
  return halkaName.replace(/\s+/g, '').toUpperCase();
}

/**
 * Resolve the voter parchi design for a mobile login.
 * Uses the access code's selected design when valid; otherwise halka default.
 */
export async function resolveParchiDesignForMobile(
  db: Db,
  halkaName: string,
  access?: MobileAccessCode | null
): Promise<Record<string, unknown>> {
  const normalized = normalizeHalka(halkaName);

  if (access?.parchiDesignId) {
    const selected = await getDesignById(access.parchiDesignId, db);
    if (selected && normalizeHalka(selected.halkaName) === normalized) {
      return { ...selected, _id: selected._id };
    }
  }

  const existing = await db
    .collection('voter_parchi_designs')
    .findOne({ halkaName: normalized, isDefault: true });
  if (existing) {
    return { ...existing, _id: String(existing._id) };
  }
  return createDefaultDesign(normalized) as unknown as Record<string, unknown>;
}
