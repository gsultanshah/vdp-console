import crypto from 'crypto';
import type { Db } from 'mongodb';
import { buildFlexibleCnicRegex, isCnicLikeQuery, normalizeCnicDigits } from '@/lib/cnic';
import { getAccessCodeByCode } from '@/lib/mobile/access-codes';
import { resolveBrandingForAccessCode } from '@/lib/mobile/branding';
import { createDefaultDesign } from '@/lib/voter-parchi/defaults';
import {
  enrichVotersWithPolling,
  voterFilterQuery,
} from '@/lib/voter-parchi/voter-data';
import type { ParchiVoterRecord } from '@/lib/voter-parchi/types';
import type { MobileSyncBundle, MobileSyncVoter, ResolvedMobileBranding } from '@/lib/mobile/types';
import { MOBILE_SYNC_CHUNK_SIZE, MOBILE_SYNC_PROJECTION } from '@/lib/mobile/types';

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
  const limit = Math.min(50, Math.max(1, input.limit ?? 50));
  const q = input.q.trim();
  if (!q) return [];

  const baseFilter = voterFilterQuery(
    input.halkaName,
    input.blockCode ? [input.blockCode] : [],
    !input.blockCode,
    'both'
  );

  const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const digits = normalizeCnicDigits(q);
  let searchFilter: Record<string, unknown>;

  if (isCnicLikeQuery(q) && digits.length >= 5) {
    const flexible = buildFlexibleCnicRegex(digits);
    const cnicClause =
      flexible && digits.length >= 13
        ? { cnic: { $regex: flexible, $options: 'i' } }
        : { cnic: { $regex: escapeRegex(digits), $options: 'i' } };
    searchFilter = { $and: [baseFilter, cnicClause] };
  } else {
    const tokens = q.split(/\s+/).filter(Boolean);
    const tokenClause = (token: string) => ({
      $or: [
        { name: { $regex: escapeRegex(token), $options: 'i' } },
        { fatherName: { $regex: escapeRegex(token), $options: 'i' } },
        { address: { $regex: escapeRegex(token), $options: 'i' } },
        { cnic: { $regex: escapeRegex(token), $options: 'i' } },
        { silsilaNo: { $regex: escapeRegex(token), $options: 'i' } },
        { gharanaNo: { $regex: escapeRegex(token), $options: 'i' } },
      ],
    });

    const textClause =
      tokens.length <= 1 ? tokenClause(tokens[0] ?? q) : { $and: tokens.map((token) => tokenClause(token)) };
    searchFilter = { $and: [baseFilter, textClause] };
  }

  const docs = await db
    .collection('voters')
    .find(searchFilter)
    .limit(limit)
    .project(MOBILE_SYNC_PROJECTION)
    .toArray();

  const enriched = await enrichVotersWithPolling(db, halkaName, docs as Record<string, unknown>[]);
  return enriched.map((voter) => ({
    ...toSyncVoter(voter),
    halkaName,
  }));
}

export interface MobileBlockSummary {
  blockCode: string;
  voterCount: number;
}

export interface MobileBlockSyncManifest {
  version: number;
  manifestId: string;
  halkaName: string;
  blockCode: string;
  voterCount: number;
  chunkSize: number;
  totalChunks: number;
  syncedAt: string;
  branding: ResolvedMobileBranding;
  parchiDesign: Record<string, unknown> | null;
}

export interface MobileBlockSyncChunk {
  chunkIndex: number;
  totalChunks: number;
  chunkSize: number;
  voterCount: number;
  checksum: string;
  voters: MobileSyncVoter[];
}

async function resolveSyncBranding(
  db: Db,
  halkaName: string,
  accessCode?: string
): Promise<ResolvedMobileBranding | null> {
  let branding = await resolveBrandingForAccessCode(db, halkaName, {});

  if (accessCode) {
    const access = await getAccessCodeByCode(db, accessCode);
    if (!access || access.halkaName !== halkaName) return null;
    branding = await resolveBrandingForAccessCode(db, halkaName, access.branding);
  }

  return branding;
}

function chunkChecksum(voters: MobileSyncVoter[]): string {
  return crypto.createHash('sha256').update(JSON.stringify(voters)).digest('hex');
}

export async function listMobileBlockCodes(
  db: Db,
  halkaName: string
): Promise<MobileBlockSummary[]> {
  const normalized = normalizeHalka(halkaName);
  const rows = await db
    .collection('voters')
    .aggregate<{ _id: string; count: number }>([
      { $match: { halkaName: normalized, blockCode: { $exists: true, $ne: '' } } },
      { $group: { _id: '$blockCode', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ])
    .toArray();

  return rows
    .map((row) => ({
      blockCode: String(row._id ?? ''),
      voterCount: row.count ?? 0,
    }))
    .filter((row) => row.blockCode.length > 0);
}

export async function buildMobileBlockSyncManifest(
  db: Db,
  input: {
    halkaName: string;
    blockCode: string;
    accessCode?: string;
    chunkSize?: number;
  }
): Promise<MobileBlockSyncManifest | null> {
  const halkaName = normalizeHalka(input.halkaName);
  const blockCode = input.blockCode.trim();
  if (!blockCode) return null;

  const branding = await resolveSyncBranding(db, halkaName, input.accessCode);
  if (!branding) return null;

  const filter = voterFilterQuery(halkaName, [blockCode], false, 'both');
  const voterCount = await db.collection('voters').countDocuments(filter);
  const chunkSize = Math.max(50, Math.min(300, input.chunkSize ?? MOBILE_SYNC_CHUNK_SIZE));
  const totalChunks = voterCount === 0 ? 0 : Math.ceil(voterCount / chunkSize);
  const syncedAt = new Date().toISOString();
  const manifestId = crypto
    .createHash('sha256')
    .update(`${halkaName}|${blockCode}|${voterCount}|${chunkSize}|${syncedAt.slice(0, 10)}`)
    .digest('hex');

  const parchiDesign = await getDefaultParchiDesign(db, halkaName);

  return {
    version: 2,
    manifestId,
    halkaName,
    blockCode,
    voterCount,
    chunkSize,
    totalChunks,
    syncedAt,
    branding,
    parchiDesign,
  };
}

export async function buildMobileBlockSyncChunk(
  db: Db,
  input: {
    halkaName: string;
    blockCode: string;
    chunkIndex: number;
    chunkSize?: number;
    accessCode?: string;
  }
): Promise<MobileBlockSyncChunk | null> {
  const halkaName = normalizeHalka(input.halkaName);
  const blockCode = input.blockCode.trim();
  if (!blockCode) return null;

  const branding = await resolveSyncBranding(db, halkaName, input.accessCode);
  if (!branding) return null;

  const chunkSize = Math.max(50, Math.min(300, input.chunkSize ?? MOBILE_SYNC_CHUNK_SIZE));
  const chunkIndex = Math.max(0, input.chunkIndex);
  const filter = voterFilterQuery(halkaName, [blockCode], false, 'both');
  const totalCount = await db.collection('voters').countDocuments(filter);
  const totalChunks = totalCount === 0 ? 0 : Math.ceil(totalCount / chunkSize);
  if (chunkIndex >= totalChunks) {
    return {
      chunkIndex,
      totalChunks,
      chunkSize,
      voterCount: 0,
      checksum: chunkChecksum([]),
      voters: [],
    };
  }

  const docs = await db
    .collection('voters')
    .find(filter)
    .sort({ _id: 1 })
    .skip(chunkIndex * chunkSize)
    .limit(chunkSize)
    .project(MOBILE_SYNC_PROJECTION)
    .toArray();

  const enriched = await enrichVotersWithPolling(db, halkaName, docs as Record<string, unknown>[]);
  const voters: MobileSyncVoter[] = enriched.map((voter) => ({
    ...toSyncVoter(voter),
    halkaName,
  }));

  return {
    chunkIndex,
    totalChunks,
    chunkSize,
    voterCount: voters.length,
    checksum: chunkChecksum(voters),
    voters,
  };
}
