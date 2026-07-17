import connectDB from '@/lib/mongodb';
import Constituency from '@/models/Constituency';
import { blockCodeStringVariants } from '@/lib/blockcode-rename';

export interface DeletedBlockCodeRecord {
  blockCode: string;
  deletedAt: Date | string;
  deletedBy?: string | null;
  deletedByName?: string | null;
}

export interface DeletedBlockCodeListItem extends DeletedBlockCodeRecord {
  constituencyId: string;
  halkaName: string;
}

function normalizeHalka(halkaName: string): string {
  return halkaName.replace(/\s+/g, '').toUpperCase();
}

function sameBlockCode(a: string, b: string): boolean {
  const aDigits = String(a ?? '').replace(/\D/g, '');
  const bDigits = String(b ?? '').replace(/\D/g, '');
  if (aDigits && bDigits) {
    return aDigits.replace(/^0+/, '') === bDigits.replace(/^0+/, '') || aDigits === bDigits;
  }
  return String(a).trim() === String(b).trim();
}

function matchesBlockCode(candidate: string, target: string): boolean {
  const variants = new Set(blockCodeStringVariants(target));
  return variants.has(candidate) || sameBlockCode(candidate, target);
}

export function isBlockCodeDeleted(
  deletedBlockCodes: unknown,
  blockCode: string
): boolean {
  if (!Array.isArray(deletedBlockCodes) || !blockCode.trim()) return false;
  return deletedBlockCodes.some((entry) => {
    const code = typeof entry === 'string' ? entry : String((entry as { blockCode?: string })?.blockCode ?? '');
    return matchesBlockCode(code, blockCode);
  });
}

export async function softDeleteBlockCode(input: {
  halkaName: string;
  blockCode: string;
  deletedBy: string;
  deletedByName: string;
}): Promise<{
  halkaName: string;
  blockCode: string;
  blockCodes: string[];
  deletedBlockCodes: DeletedBlockCodeRecord[];
}> {
  await connectDB();
  const halkaName = normalizeHalka(input.halkaName);
  const blockCode = String(input.blockCode ?? '').trim();
  if (!blockCode) {
    throw new Error('blockCode is required');
  }

  const constituency = await Constituency.findOne({
    halkaName,
    deletedAt: null,
  });
  if (!constituency) {
    throw new Error(`Constituency ${halkaName} not found`);
  }

  const activeCodes: string[] = Array.isArray(constituency.blockCodes)
    ? constituency.blockCodes.map((code: string) => String(code))
    : [];
  const matchIndex = activeCodes.findIndex((code) => matchesBlockCode(code, blockCode));
  if (matchIndex < 0) {
    throw new Error(`Block code ${blockCode} was not found in ${halkaName}`);
  }

  const removedCode = activeCodes[matchIndex];
  const nextActive = activeCodes.filter((_, index) => index !== matchIndex);

  const existingDeleted: DeletedBlockCodeRecord[] = Array.isArray(constituency.deletedBlockCodes)
    ? constituency.deletedBlockCodes.map((entry: DeletedBlockCodeRecord | string) =>
        typeof entry === 'string'
          ? { blockCode: entry, deletedAt: new Date(), deletedBy: null, deletedByName: null }
          : {
              blockCode: String(entry.blockCode ?? ''),
              deletedAt: entry.deletedAt ?? new Date(),
              deletedBy: entry.deletedBy ?? null,
              deletedByName: entry.deletedByName ?? null,
            }
      )
    : [];

  const withoutDupes = existingDeleted.filter((entry) => !matchesBlockCode(entry.blockCode, removedCode));
  const nextDeleted: DeletedBlockCodeRecord[] = [
    {
      blockCode: removedCode,
      deletedAt: new Date(),
      deletedBy: input.deletedBy,
      deletedByName: input.deletedByName,
    },
    ...withoutDupes,
  ];

  const nextColumnSettings = Array.isArray(constituency.blockCodeColumnSettings)
    ? constituency.blockCodeColumnSettings.filter(
        (entry: { blockCode?: string }) => !matchesBlockCode(String(entry.blockCode ?? ''), removedCode)
      )
    : [];

  constituency.blockCodes = nextActive;
  constituency.deletedBlockCodes = nextDeleted;
  constituency.blockCodeColumnSettings = nextColumnSettings;
  constituency.lastUpdated = new Date();
  constituency.updatedAt = new Date();
  await constituency.save();

  return {
    halkaName,
    blockCode: removedCode,
    blockCodes: nextActive,
    deletedBlockCodes: nextDeleted,
  };
}

export async function listDeletedBlockCodes(): Promise<DeletedBlockCodeListItem[]> {
  await connectDB();
  const constituencies = await Constituency.find({
    deletedAt: null,
    'deletedBlockCodes.0': { $exists: true },
  })
    .select({ halkaName: 1, deletedBlockCodes: 1 })
    .lean();

  const items: DeletedBlockCodeListItem[] = [];
  for (const constituency of constituencies) {
    const halkaName = String(constituency.halkaName ?? '');
    const constituencyId = String(constituency._id ?? '');
    const deleted = Array.isArray(constituency.deletedBlockCodes)
      ? constituency.deletedBlockCodes
      : [];
    for (const entry of deleted) {
      const record =
        typeof entry === 'string'
          ? { blockCode: entry, deletedAt: new Date(), deletedBy: null, deletedByName: null }
          : {
              blockCode: String(entry.blockCode ?? ''),
              deletedAt: entry.deletedAt ?? new Date(),
              deletedBy: entry.deletedBy ?? null,
              deletedByName: entry.deletedByName ?? null,
            };
      if (!record.blockCode) continue;
      items.push({
        ...record,
        constituencyId,
        halkaName,
      });
    }
  }

  items.sort((a, b) => {
    const aTime = new Date(a.deletedAt).getTime();
    const bTime = new Date(b.deletedAt).getTime();
    return bTime - aTime;
  });
  return items;
}

export async function restoreDeletedBlockCode(input: {
  halkaName: string;
  blockCode: string;
}): Promise<{
  halkaName: string;
  blockCode: string;
  blockCodes: string[];
  deletedBlockCodes: DeletedBlockCodeRecord[];
}> {
  await connectDB();
  const halkaName = normalizeHalka(input.halkaName);
  const blockCode = String(input.blockCode ?? '').trim();
  if (!blockCode) {
    throw new Error('blockCode is required');
  }

  const constituency = await Constituency.findOne({
    halkaName,
    deletedAt: null,
  });
  if (!constituency) {
    throw new Error(`Constituency ${halkaName} not found`);
  }

  const activeCodes: string[] = Array.isArray(constituency.blockCodes)
    ? constituency.blockCodes.map((code: string) => String(code))
    : [];
  if (activeCodes.some((code) => matchesBlockCode(code, blockCode))) {
    throw new Error(`Block code ${blockCode} is already active in ${halkaName}`);
  }

  const deleted: DeletedBlockCodeRecord[] = Array.isArray(constituency.deletedBlockCodes)
    ? constituency.deletedBlockCodes.map((entry: DeletedBlockCodeRecord | string) =>
        typeof entry === 'string'
          ? { blockCode: entry, deletedAt: new Date(), deletedBy: null, deletedByName: null }
          : {
              blockCode: String(entry.blockCode ?? ''),
              deletedAt: entry.deletedAt ?? new Date(),
              deletedBy: entry.deletedBy ?? null,
              deletedByName: entry.deletedByName ?? null,
            }
      )
    : [];

  const match = deleted.find((entry) => matchesBlockCode(entry.blockCode, blockCode));
  if (!match) {
    throw new Error(`Deleted block code ${blockCode} was not found in ${halkaName}`);
  }

  const nextDeleted = deleted.filter((entry) => !matchesBlockCode(entry.blockCode, match.blockCode));
  const nextActive = [...activeCodes, match.blockCode];

  constituency.blockCodes = nextActive;
  constituency.deletedBlockCodes = nextDeleted;
  constituency.lastUpdated = new Date();
  constituency.updatedAt = new Date();
  await constituency.save();

  return {
    halkaName,
    blockCode: match.blockCode,
    blockCodes: nextActive,
    deletedBlockCodes: nextDeleted,
  };
}

export async function getDeletedBlockCodeSetForHalka(
  halkaName: string
): Promise<Set<string>> {
  await connectDB();
  const constituency = (await Constituency.findOne({
    halkaName: normalizeHalka(halkaName),
    deletedAt: null,
  })
    .select({ deletedBlockCodes: 1 })
    .lean()) as { deletedBlockCodes?: unknown } | null;

  const deleted = new Set<string>();
  if (!constituency || !Array.isArray(constituency.deletedBlockCodes)) {
    return deleted;
  }

  for (const entry of constituency.deletedBlockCodes) {
    const code =
      typeof entry === 'string' ? entry : String((entry as { blockCode?: string }).blockCode ?? '');
    for (const variant of blockCodeStringVariants(code)) {
      deleted.add(variant);
    }
  }
  return deleted;
}
