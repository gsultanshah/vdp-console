import type { Db } from 'mongodb';
import { getAccessCodeByCode } from '@/lib/mobile/access-codes';
import { resolveBrandingForAccessCode } from '@/lib/mobile/branding';
import { createDefaultDesign } from '@/lib/voter-parchi/defaults';
import {
  enrichVotersWithPolling,
  voterFilterQuery,
} from '@/lib/voter-parchi/voter-data';
import type { ParchiVoterRecord } from '@/lib/voter-parchi/types';
import type { MobileSyncBundle, MobileSyncVoter } from '@/lib/mobile/types';
import { MOBILE_SYNC_PROJECTION } from '@/lib/mobile/types';

const DESIGNS_COLLECTION = 'voter_parchi_designs';

function normalizeHalka(halkaName: string): string {
  return halkaName.replace(/\s+/g, '').toUpperCase();
}

function toSyncVoter(voter: ParchiVoterRecord): MobileSyncVoter {
  return {
    _id: voter._id,
    cnic: voter.cnic,
    name: voter.name,
    fatherName: voter.fatherName,
    age: voter.age,
    address: voter.address,
    previousAddress: voter.previousAddress,
    blockCode: voter.blockCode,
    silsilaNo: voter.silsilaNo,
    gharanaNo: voter.gharanaNo,
    gender: voter.gender,
    religion: voter.religion,
    profession: voter.profession,
    halkaName: '',
    imageUrl: voter.imageUrl,
    rowY: voter.rowY,
    rowHeight: voter.rowHeight,
    pollingStation: voter.pollingStation,
    statisticalCode: voter.statisticalCode,
    rowCropUrl: voter.rowCropUrl,
  };
}

async function getDefaultParchiDesign(db: Db, halkaName: string): Promise<Record<string, unknown>> {
  const normalized = normalizeHalka(halkaName);
  const existing = await db
    .collection(DESIGNS_COLLECTION)
    .findOne({ halkaName: normalized, isDefault: true });
  if (existing) {
    return { ...existing, _id: String(existing._id) };
  }
  return createDefaultDesign(normalized) as Record<string, unknown>;
}

async function fetchVotersForSync(
  db: Db,
  halkaName: string,
  blockCode: string | null
): Promise<Record<string, unknown>[]> {
  const filter = voterFilterQuery(
    halkaName,
    blockCode ? [blockCode] : [],
    !blockCode,
    'both'
  );

  const docs: Record<string, unknown>[] = [];
  const batchSize = 500;
  let cursorId: unknown = null;

  while (true) {
    const query = { ...filter } as Record<string, unknown>;
    if (cursorId) {
      query._id = { $gt: cursorId };
    }

    const batch = await db
      .collection('voters')
      .find(query)
      .sort({ _id: 1 })
      .limit(batchSize)
      .project(MOBILE_SYNC_PROJECTION)
      .toArray();

    if (batch.length === 0) break;
    docs.push(...(batch as Record<string, unknown>[]));
    cursorId = batch[batch.length - 1]._id;
    if (batch.length < batchSize) break;
  }

  return docs;
}

export async function buildMobileSyncBundle(
  db: Db,
  input: {
    halkaName: string;
    blockCode?: string | null;
    accessCode?: string;
  }
): Promise<MobileSyncBundle | null> {
  const halkaName = normalizeHalka(input.halkaName);
  let branding = await resolveBrandingForAccessCode(db, halkaName, {});

  if (input.accessCode) {
    const access = await getAccessCodeByCode(db, input.accessCode);
    if (!access || access.halkaName !== halkaName) return null;
    branding = await resolveBrandingForAccessCode(db, halkaName, access.branding);
  }

  const blockCode = input.blockCode?.trim() || null;
  const voterDocs = await fetchVotersForSync(db, halkaName, blockCode);
  const enriched = await enrichVotersWithPolling(db, halkaName, voterDocs);

  const voters: MobileSyncVoter[] = enriched.map((voter) => ({
    ...toSyncVoter(voter),
    halkaName,
  }));

  const pollingScheme = await db
    .collection('polling_scheme')
    .find({ halkaName })
    .project({
      polling_station_name: 1,
      area: 1,
      blockcode: 1,
      type: 1,
      male_booth: 1,
      female_booth: 1,
      total_booth: 1,
      sourceRawText: 1,
    })
    .toArray();

  const blockCodes = blockCode
    ? [blockCode]
    : await db.collection('voters').distinct('blockCode', { halkaName });

  const parchiDesign = await getDefaultParchiDesign(db, halkaName);

  return {
    version: 1,
    type: blockCode ? 'block' : 'constituency',
    halkaName,
    blockCode,
    syncedAt: new Date().toISOString(),
    voterCount: voters.length,
    blockCodes: blockCodes.map(String).sort(),
    voters,
    pollingScheme: pollingScheme.map((row) => ({ ...row, _id: String(row._id) })),
    parchiDesign,
    branding,
  };
}

export async function searchMobileVotersOnline(
  db: Db,
  input: {
    halkaName: string;
    q: string;
    blockCode?: string;
    limit?: number;
  }
): Promise<Record<string, unknown>[]> {
  const halkaName = normalizeHalka(input.halkaName);
  const limit = Math.min(50, Math.max(1, input.limit ?? 25));
  const q = input.q.trim();
  if (!q) return [];

  const filter: Record<string, unknown> = { halkaName };
  if (input.blockCode) filter.blockCode = input.blockCode;

  const digits = q.replace(/\D/g, '');
  if (digits.length >= 5) {
    filter.cnic = { $regex: digits, $options: 'i' };
  } else {
    filter.$or = [
      { name: { $regex: q, $options: 'i' } },
      { fatherName: { $regex: q, $options: 'i' } },
      { cnic: { $regex: q, $options: 'i' } },
      { silsilaNo: { $regex: q, $options: 'i' } },
      { gharanaNo: { $regex: q, $options: 'i' } },
    ];
  }

  const docs = await db
    .collection('voters')
    .find(filter)
    .limit(limit)
    .project(MOBILE_SYNC_PROJECTION)
    .toArray();

  const enriched = await enrichVotersWithPolling(db, halkaName, docs as Record<string, unknown>[]);
  return enriched.map((voter) => ({
    ...toSyncVoter(voter),
    halkaName,
  }));
}
