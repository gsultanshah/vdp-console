import { ObjectId, type Db } from 'mongodb';
import { createDefaultDesign } from '@/lib/voter-parchi/defaults';
import { getDesignById } from '@/lib/voter-parchi/job-service';
import type { MobileAccessCode } from '@/lib/mobile/types';

function normalizeHalka(halkaName: string): string {
  return halkaName.replace(/\s+/g, '').toUpperCase();
}

export type MobileParchiDesignSummary = {
  parchiDesignId: string | null;
  parchiDesignName: string;
  parchiDesignCode: string | null;
  parchiDesignIsDefault: boolean;
};

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

export function summarizeParchiDesign(design: Record<string, unknown>): MobileParchiDesignSummary {
  return {
    parchiDesignId: design._id != null ? String(design._id) : null,
    parchiDesignName: typeof design.name === 'string' && design.name.trim() ? design.name : 'Default',
    parchiDesignCode: typeof design.designCode === 'string' ? design.designCode : null,
    parchiDesignIsDefault: design.isDefault === true,
  };
}

/** Attach resolved design name/code to each mobile login for list UI. */
export async function attachParchiDesignSummaries<T extends MobileAccessCode>(
  db: Db,
  codes: T[],
): Promise<Array<T & MobileParchiDesignSummary>> {
  if (codes.length === 0) return [];

  const designIds = Array.from(
    new Set(
      codes
        .map((code) => code.parchiDesignId)
        .filter((id): id is string => Boolean(id) && ObjectId.isValid(id!)),
    ),
  );
  const byId = new Map<
    string,
    { name: string; designCode?: string | null; isDefault?: boolean; halkaName: string }
  >();
  if (designIds.length > 0) {
    const docs = await db
      .collection('voter_parchi_designs')
      .find({ _id: { $in: designIds.map((id) => new ObjectId(id)) } })
      .toArray();
    for (const doc of docs) {
      byId.set(String(doc._id), {
        name: typeof doc.name === 'string' ? doc.name : 'Untitled',
        designCode: typeof doc.designCode === 'string' ? doc.designCode : null,
        isDefault: doc.isDefault === true,
        halkaName: typeof doc.halkaName === 'string' ? doc.halkaName : '',
      });
    }
  }

  const halkas = Array.from(new Set(codes.map((code) => normalizeHalka(code.halkaName))));
  const defaults = await db
    .collection('voter_parchi_designs')
    .find({ halkaName: { $in: halkas }, isDefault: true })
    .toArray();
  const defaultByHalka = new Map(
    defaults.map((doc) => [
      normalizeHalka(String(doc.halkaName ?? '')),
      {
        id: String(doc._id),
        name: typeof doc.name === 'string' ? doc.name : 'Default',
        designCode: typeof doc.designCode === 'string' ? doc.designCode : null,
      },
    ]),
  );

  return codes.map((code) => {
    const halka = normalizeHalka(code.halkaName);
    const selected = code.parchiDesignId ? byId.get(code.parchiDesignId) : null;
    if (selected && normalizeHalka(selected.halkaName) === halka) {
      return {
        ...code,
        parchiDesignId: code.parchiDesignId ?? null,
        parchiDesignName: selected.name,
        parchiDesignCode: selected.designCode ?? null,
        parchiDesignIsDefault: selected.isDefault === true,
      };
    }
    const fallback = defaultByHalka.get(halka);
    if (fallback) {
      return {
        ...code,
        parchiDesignId: code.parchiDesignId ?? null,
        parchiDesignName: fallback.name,
        parchiDesignCode: fallback.designCode,
        parchiDesignIsDefault: true,
      };
    }
    return {
      ...code,
      parchiDesignId: code.parchiDesignId ?? null,
      parchiDesignName: 'Default',
      parchiDesignCode: null,
      parchiDesignIsDefault: true,
    };
  });
}
