import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { normalizeAllowedBlockCodes, validateBlockCodesLimit } from '@/lib/mobile/block-access';

export interface MobileAccessCodeImportRow {
  halkaName: string;
  name: string;
  phone: string;
  address: string;
  comments: string;
  label: string;
  selectAllBlockCodes: boolean;
  blockCodes: string[];
}

export interface ParsedMobileAccessCodeImportRow {
  ok: true;
  row: MobileAccessCodeImportRow;
}

export interface FailedMobileAccessCodeImportRow {
  ok: false;
  error: string;
}

export type MobileAccessCodeImportParseResult =
  | ParsedMobileAccessCodeImportRow
  | FailedMobileAccessCodeImportRow;

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function pickValue(row: Record<string, unknown>, aliases: string[]): string {
  const normalized = new Map<string, unknown>();
  for (const [key, value] of Object.entries(row)) {
    normalized.set(normalizeKey(key), value);
  }
  for (const alias of aliases) {
    const raw = normalized.get(normalizeKey(alias));
    if (raw != null && String(raw).trim()) {
      return String(raw).trim();
    }
  }
  return '';
}

/** Empty / all / 1 / true / yes => all block codes; otherwise comma/space/semicolon separated codes. */
export function parseBlockAccessField(
  raw: string,
  rowNumber: number
): { ok: true; selectAllBlockCodes: boolean; blockCodes: string[] } | { ok: false; error: string } {
  const value = raw.trim();
  if (!value) {
    return { ok: true, selectAllBlockCodes: true, blockCodes: [] };
  }

  const normalized = value.toLowerCase().replace(/\s+/g, '');
  if (
    normalized === 'all' ||
    normalized === '1' ||
    normalized === 'true' ||
    normalized === 'yes' ||
    normalized === '*'
  ) {
    return { ok: true, selectAllBlockCodes: true, blockCodes: [] };
  }

  if (
    normalized === '0' ||
    normalized === 'false' ||
    normalized === 'no' ||
    normalized === 'none'
  ) {
    return {
      ok: false,
      error: `Row ${rowNumber}: blockcodes must be "all", "1", or a comma-separated list of codes`,
    };
  }

  const blockCodes = normalizeAllowedBlockCodes(
    value.split(/[,;\n|]+/).map((part) => part.trim()).filter(Boolean)
  );

  if (blockCodes.length === 0) {
    return {
      ok: false,
      error: `Row ${rowNumber}: blockcodes must be "all", "1", or a comma-separated list of codes`,
    };
  }

  try {
    validateBlockCodesLimit(blockCodes);
  } catch (error) {
    return {
      ok: false,
      error: `Row ${rowNumber}: ${error instanceof Error ? error.message : 'Too many block codes'}`,
    };
  }

  return { ok: true, selectAllBlockCodes: false, blockCodes };
}

export async function parseAccessCodeSpreadsheet(
  fileBuffer: Buffer,
  ext: string,
): Promise<Record<string, unknown>[]> {
  if (ext === 'csv') {
    const csv = fileBuffer.toString('utf8');
    const { data, errors } = Papa.parse<Record<string, unknown>>(csv, {
      header: true,
      skipEmptyLines: true,
    });
    if (errors.length > 0) {
      throw new Error(`CSV parse error: ${errors[0].message}`);
    }
    return data;
  }

  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[];
}

export function parseAccessCodeImportRow(
  row: Record<string, unknown>,
  rowNumber: number,
  defaultHalkaName: string,
  validHalkaNames: string[],
): MobileAccessCodeImportParseResult {
  const halkaNameRaw = pickValue(row, [
    'constituency',
    'halka',
    'halkaname',
    'halka_name',
    'halka name',
  ]);
  const halkaName = (halkaNameRaw || defaultHalkaName).replace(/\s+/g, '').toUpperCase();

  if (!halkaName) {
    return { ok: false, error: `Row ${rowNumber}: constituency is required` };
  }

  if (validHalkaNames.length > 0 && !validHalkaNames.includes(halkaName)) {
    return {
      ok: false,
      error: `Row ${rowNumber}: unknown constituency "${halkaName}"`,
    };
  }

  const name = pickValue(row, ['name', 'fullname', 'full_name', 'workername', 'worker_name']);
  if (!name) {
    return { ok: false, error: `Row ${rowNumber}: name is required` };
  }

  const phone = pickValue(row, ['phone', 'mobile', 'contact', 'phonenumber', 'phone_number']);
  const address = pickValue(row, ['address', 'location', 'area']);
  const comments = pickValue(row, ['comments', 'comment', 'notes', 'note', 'remarks', 'remark']);
  const label = pickValue(row, ['label', 'team', 'teamlabel', 'team_label']) || name;
  const blockCodesRaw = pickValue(row, [
    'blockcodes',
    'blockcode',
    'block_codes',
    'block_code',
    'blocks',
    'allowedblockcodes',
    'allowed_block_codes',
  ]);

  const blockAccess = parseBlockAccessField(blockCodesRaw, rowNumber);
  if (!blockAccess.ok) {
    return { ok: false, error: blockAccess.error };
  }

  return {
    ok: true,
    row: {
      halkaName,
      name,
      phone,
      address,
      comments,
      label,
      selectAllBlockCodes: blockAccess.selectAllBlockCodes,
      blockCodes: blockAccess.blockCodes,
    },
  };
}

export function buildAccessCodeSampleRows(defaultHalkaName = 'NA120') {
  return [
    {
      name: 'Ali Khan',
      phone: '03001234567',
      address: 'Ward 5, Main Bazaar',
      comments: 'Morning shift',
      constituency: defaultHalkaName,
      label: 'Ali Khan',
      blockcodes: 'all',
    },
    {
      name: 'Sara Ahmed',
      phone: '03211234567',
      address: 'Block B, Model Town',
      comments: '',
      constituency: defaultHalkaName,
      label: 'Sara Ahmed',
      blockcodes: '1',
    },
    {
      name: 'Usman Raza',
      phone: '03331234567',
      address: 'Village Chak 12',
      comments: 'Limited blocks',
      constituency: '',
      label: 'Usman Raza',
      blockcodes: '1234567, 2345678',
    },
  ];
}
