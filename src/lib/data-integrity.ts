import fs from 'fs/promises';
import path from 'path';
import type { Db } from 'mongodb';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const AGGREGATE_TIMEOUT_MS = 120_000;

function normalizeHalkaName(name: string): string {
  return name.replace(/\s+/g, '').toUpperCase();
}

export interface BlockIntegrityRow {
  blockCode: string;
  localFiles: number;
  dbPages: number;
  voters: number;
  ocrProcessed: number;
  uploadMatch: boolean;
  hasLocalFolder: boolean;
  notes: string;
}

export interface IntegrityReport {
  halkaName: string;
  rootFolder: string;
  checkedAt: string;
  rows: BlockIntegrityRow[];
}

export interface BlockCodeDbCounts {
  dbPages: number;
  voters: number;
  ocrProcessed: number;
}

export async function countImageFilesInDir(dir: string): Promise<number> {
  let count = 0;
  const stack = [dir];

  while (stack.length > 0) {
    const currentDir = stack.pop()!;
    let entries;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) {
        continue;
      }

      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        count += 1;
      }
    }
  }

  return count;
}

export async function listBlockCodeFolders(rootFolder: string): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(rootFolder, { withFileTypes: true });
  } catch (error) {
    throw new Error(
      `Cannot read folder "${rootFolder}": ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }

  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export async function getRegisteredBlockCodes(db: Db, halkaName: string): Promise<string[]> {
  const constituency = await db.collection('constituencies').findOne(
    { halkaName, deletedAt: null },
    { projection: { blockCodes: 1 } }
  );

  const fromConstituency = Array.isArray(constituency?.blockCodes)
    ? constituency.blockCodes.map((code: string) => String(code).trim()).filter(Boolean)
    : [];

  return fromConstituency.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export async function loadDbCountsByBlockCode(
  db: Db,
  halkaName: string
): Promise<Map<string, BlockCodeDbCounts>> {
  const [pageStats, voterStats] = await Promise.all([
    db
      .collection('blockcodes')
      .aggregate<{ _id: string; dbPages: number; ocrProcessed: number }>(
        [
          { $match: { halkaName } },
          {
            $group: {
              _id: '$blockCode',
              dbPages: { $sum: 1 },
              ocrProcessed: {
                $sum: {
                  $cond: [
                    {
                      $or: [{ $ne: ['$ocrAt', null] }, { $ne: ['$ocr_data', null] }],
                    },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ],
        { maxTimeMS: AGGREGATE_TIMEOUT_MS }
      )
      .toArray(),
    db
      .collection('voters')
      .aggregate<{ _id: string; voters: number }>(
        [{ $match: { halkaName } }, { $group: { _id: '$blockCode', voters: { $sum: 1 } } }],
        { maxTimeMS: AGGREGATE_TIMEOUT_MS }
      )
      .toArray(),
  ]);

  const counts = new Map<string, BlockCodeDbCounts>();

  for (const row of pageStats) {
    counts.set(String(row._id), {
      dbPages: row.dbPages,
      ocrProcessed: row.ocrProcessed,
      voters: 0,
    });
  }

  for (const row of voterStats) {
    const blockCode = String(row._id);
    const existing = counts.get(blockCode) ?? { dbPages: 0, ocrProcessed: 0, voters: 0 };
    existing.voters = row.voters;
    counts.set(blockCode, existing);
  }

  return counts;
}

export function buildBlockIntegrityRow(
  blockCode: string,
  hasLocalFolder: boolean,
  localFiles: number,
  dbCounts: BlockCodeDbCounts | undefined
): BlockIntegrityRow {
  const dbPages = dbCounts?.dbPages ?? 0;
  const voters = dbCounts?.voters ?? 0;
  const ocrProcessed = dbCounts?.ocrProcessed ?? 0;
  const uploadMatch = hasLocalFolder && localFiles === dbPages;
  const notes: string[] = [];

  if (!hasLocalFolder) {
    notes.push('no local folder');
  }
  if (hasLocalFolder && localFiles !== dbPages) {
    const delta = localFiles - dbPages;
    notes.push(delta > 0 ? `${delta} file(s) not in DB` : `${Math.abs(delta)} DB page(s) missing locally`);
  }
  if (dbPages > 0 && voters === 0) {
    notes.push('no voters');
  }
  if (dbPages > 0 && ocrProcessed < dbPages) {
    notes.push(`${dbPages - ocrProcessed} page(s) without OCR`);
  }

  return {
    blockCode,
    localFiles,
    dbPages,
    voters,
    ocrProcessed,
    uploadMatch,
    hasLocalFolder,
    notes: notes.join('; '),
  };
}


export async function buildIntegrityReport(
  db: Db,
  input: {
    halkaName: string;
    rootFolder: string;
    onRow?: (row: BlockIntegrityRow) => void;
    onStatus?: (message: string) => void;
  }
): Promise<IntegrityReport> {
  const halkaName = normalizeHalkaName(input.halkaName);
  const rootFolder = path.resolve(input.rootFolder);
  const onStatus = input.onStatus;

  onStatus?.('Scanning local block-code folders…');
  const folderBlockCodes = await listBlockCodeFolders(rootFolder);
  onStatus?.(`Found ${folderBlockCodes.length} local block-code folder(s).`);

  onStatus?.('Loading database counts (blockcodes + voters)…');
  const [dbCounts, registeredBlockCodes] = await Promise.all([
    loadDbCountsByBlockCode(db, halkaName),
    getRegisteredBlockCodes(db, halkaName),
  ]);
  onStatus?.(`Loaded counts for ${dbCounts.size} block code(s) from server.`);

  const folderSet = new Set(folderBlockCodes);
  const blockCodes = Array.from(
    new Set([...folderBlockCodes, ...registeredBlockCodes, ...Array.from(dbCounts.keys())])
  ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  onStatus?.(`Checking ${blockCodes.length} block code(s)…`);

  const rows: BlockIntegrityRow[] = [];

  for (const blockCode of blockCodes) {
    const hasLocalFolder = folderSet.has(blockCode);
    const localFiles = hasLocalFolder
      ? await countImageFilesInDir(path.join(rootFolder, blockCode))
      : 0;

    const row = buildBlockIntegrityRow(blockCode, hasLocalFolder, localFiles, dbCounts.get(blockCode));
    rows.push(row);
    input.onRow?.(row);
  }

  return {
    halkaName,
    rootFolder,
    checkedAt: new Date().toISOString(),
    rows,
  };
}

export function summarizeIntegrityReport(report: IntegrityReport): {
  totalBlockCodes: number;
  uploadMismatches: number;
  missingFolders: number;
  emptyVoterBlocks: number;
  incompleteOcr: number;
} {
  return {
    totalBlockCodes: report.rows.length,
    uploadMismatches: report.rows.filter((row) => row.hasLocalFolder && !row.uploadMatch).length,
    missingFolders: report.rows.filter((row) => !row.hasLocalFolder).length,
    emptyVoterBlocks: report.rows.filter((row) => row.dbPages > 0 && row.voters === 0).length,
    incompleteOcr: report.rows.filter((row) => row.dbPages > 0 && row.ocrProcessed < row.dbPages).length,
  };
}
