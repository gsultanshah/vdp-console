import crypto from 'crypto';
import type { Db } from 'mongodb';
import { buildFlexibleCnicRegex, isCnicLikeQuery, normalizeCnicDigits } from '@/lib/cnic';
import { getAccessCodeByCode } from '@/lib/mobile/access-codes';
import {
  accessAllowsAllBlockCodes,
  filterAllowedBlockCodes,
  getAllowedBlockCodes,
  isBlockCodeAllowed,
  resolveSearchBlockFilter,
} from '@/lib/mobile/block-access';
import { resolveBrandingForAccessCode } from '@/lib/mobile/branding';
import { createDefaultDesign } from '@/lib/voter-parchi/defaults';
import {
  enrichVotersWithPolling,
  voterFilterQuery,
} from '@/lib/voter-parchi/voter-data';
import type { ParchiVoterRecord } from '@/lib/voter-parchi/types';
import type {
  MobileAccessCode,
  MobileSyncBundle,
  MobileSyncVoter,
  ResolvedMobileBranding,
} from '@/lib/mobile/types';
import { MOBILE_SYNC_CHUNK_SIZE, MOBILE_SYNC_PROJECTION } from '@/lib/mobile/types';

const DESIGNS_COLLECTION = 'voter_parchi_designs';

function normalizeHalka(halkaName: string): string {
  return halkaName.replace(/\s+/g, '').toUpperCase();
}

function blockCodeMatchKeys(code: string): string[] {
  const raw = String(code ?? '').trim();
  if (!raw) return [];
  const digits = raw.replace(/\D/g, '');
  const keys = [raw];
  if (digits) {
    keys.push(digits, digits.replace(/^0+/, '') || digits);
    if (digits.length <= 7) keys.push(digits.padStart(7, '0'));
  }
  return keys;
}

function isSoftDeletedBlockCode(deletedEntries: unknown, blockCode: string): boolean {
  if (!Array.isArray(deletedEntries) || !blockCode.trim()) return false;
  const targetKeys = new Set(blockCodeMatchKeys(blockCode));
  return deletedEntries.some((entry) => {
    const code =
      typeof entry === 'string'
        ? entry
        : String((entry as { blockCode?: string })?.blockCode ?? '');
    return blockCodeMatchKeys(code).some((key) => targetKeys.has(key));
  });
}

async function assertBlockCodeNotSoftDeleted(
  db: Db,
  halkaName: string,
  blockCode: string
): Promise<boolean> {
  const constituency = await db.collection('constituencies').findOne(
    { halkaName: normalizeHalka(halkaName), deletedAt: null },
    { projection: { deletedBlockCodes: 1 } }
  );
  return !isSoftDeletedBlockCode(constituency?.deletedBlockCodes, blockCode);
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

async function resolveAccessForSync(
  db: Db,
  halkaName: string,
  accessCode?: string
): Promise<MobileAccessCode | null> {
  if (!accessCode) {
    return null;
  }
  const access = await getAccessCodeByCode(db, accessCode);
  if (!access || access.halkaName !== halkaName) {
    return null;
  }
  return access;
}

async function fetchVotersForSync(
  db: Db,
  halkaName: string,
  blockCode: string | null,
  access: MobileAccessCode | null
): Promise<Record<string, unknown>[]> {
  let selectAll = !blockCode;
  let blockCodes = blockCode ? [blockCode] : [];

  if (!blockCode && access && !accessAllowsAllBlockCodes(access)) {
    blockCodes = getAllowedBlockCodes(access);
    selectAll = false;
    if (blockCodes.length === 0) {
      return [];
    }
  }

  const filter = voterFilterQuery(halkaName, blockCodes, selectAll, 'both');

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
  let access: MobileAccessCode | null = null;

  if (input.accessCode) {
    access = await resolveAccessForSync(db, halkaName, input.accessCode);
    if (!access) return null;
    branding = await resolveBrandingForAccessCode(db, halkaName, access.branding);
  }

  const blockCode = input.blockCode?.trim() || null;
  if (blockCode && access && !isBlockCodeAllowed(access, blockCode)) {
    return null;
  }
  if (!blockCode && access && !accessAllowsAllBlockCodes(access)) {
    return null;
  }

  const voterDocs = await fetchVotersForSync(db, halkaName, blockCode, access);
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

  let blockCodes = blockCode
    ? [blockCode]
    : ((await db.collection('voters').distinct('blockCode', { halkaName })) as string[]).map(String);

  if (access && !accessAllowsAllBlockCodes(access)) {
    blockCodes = filterAllowedBlockCodes(
      access,
      blockCodes.map((code) => ({ blockCode: code }))
    ).map((item) => item.blockCode);
  }

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
    access?: MobileAccessCode | null;
  }
): Promise<Record<string, unknown>[]> {
  const halkaName = normalizeHalka(input.halkaName);
  const limit = Math.min(50, Math.max(1, input.limit ?? 50));
  const q = input.q.trim();
  if (!q) return [];

  const scope = resolveSearchBlockFilter(input.access, input.blockCode);
  if (scope.forbidden) {
    return [];
  }

  const baseFilter = voterFilterQuery(
    input.halkaName,
    scope.blockCodes,
    scope.selectAll,
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
): Promise<{ branding: ResolvedMobileBranding; access: MobileAccessCode | null } | null> {
  let branding = await resolveBrandingForAccessCode(db, halkaName, {});
  let access: MobileAccessCode | null = null;

  if (accessCode) {
    access = await resolveAccessForSync(db, halkaName, accessCode);
    if (!access) return null;
    branding = await resolveBrandingForAccessCode(db, halkaName, access.branding);
  }

  return { branding, access };
}

function chunkChecksum(voters: MobileSyncVoter[]): string {
  return crypto.createHash('sha256').update(JSON.stringify(voters)).digest('hex');
}

export async function listMobileBlockCodes(
  db: Db,
  halkaName: string,
  access?: MobileAccessCode | null
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

  const constituency = await db.collection('constituencies').findOne(
    { halkaName: normalized, deletedAt: null },
    { projection: { blockCodes: 1, deletedBlockCodes: 1 } }
  );

  const activeCodes = new Set(
    (Array.isArray(constituency?.blockCodes) ? constituency.blockCodes : []).map((code) =>
      String(code)
    )
  );
  const deletedCodes = new Set<string>();
  if (Array.isArray(constituency?.deletedBlockCodes)) {
    for (const entry of constituency.deletedBlockCodes) {
      const code =
        typeof entry === 'string'
          ? entry
          : String((entry as { blockCode?: string })?.blockCode ?? '');
      if (!code) continue;
      deletedCodes.add(code);
      const digits = code.replace(/\D/g, '');
      if (digits) {
        deletedCodes.add(digits);
        deletedCodes.add(digits.replace(/^0+/, '') || digits);
        if (digits.length <= 7) deletedCodes.add(digits.padStart(7, '0'));
      }
    }
  }

  const blocks = rows
    .map((row) => ({
      blockCode: String(row._id ?? ''),
      voterCount: row.count ?? 0,
    }))
    .filter((row) => {
      if (!row.blockCode) return false;
      const digits = row.blockCode.replace(/\D/g, '');
      if (
        deletedCodes.has(row.blockCode) ||
        (digits &&
          (deletedCodes.has(digits) ||
            deletedCodes.has(digits.replace(/^0+/, '') || digits) ||
            (digits.length <= 7 && deletedCodes.has(digits.padStart(7, '0')))))
      ) {
        return false;
      }
      // Prefer constituency active list when present; if empty/missing keep voter-derived list.
      if (activeCodes.size === 0) return true;
      if (activeCodes.has(row.blockCode)) return true;
      if (digits) {
        return (
          activeCodes.has(digits) ||
          activeCodes.has(digits.replace(/^0+/, '') || digits) ||
          (digits.length <= 7 && activeCodes.has(digits.padStart(7, '0')))
        );
      }
      return false;
    });

  return filterAllowedBlockCodes(access, blocks);
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

  const resolved = await resolveSyncBranding(db, halkaName, input.accessCode);
  if (!resolved) return null;
  if (resolved.access && !isBlockCodeAllowed(resolved.access, blockCode)) {
    return null;
  }
  if (!(await assertBlockCodeNotSoftDeleted(db, halkaName, blockCode))) {
    return null;
  }

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
    branding: resolved.branding,
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

  const resolved = await resolveSyncBranding(db, halkaName, input.accessCode);
  if (!resolved) return null;
  if (resolved.access && !isBlockCodeAllowed(resolved.access, blockCode)) {
    return null;
  }
  if (!(await assertBlockCodeNotSoftDeleted(db, halkaName, blockCode))) {
    return null;
  }

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
