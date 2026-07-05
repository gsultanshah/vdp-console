import type { VoterEditPayload } from '@/lib/voter-edit';
import type { CollationOptions } from 'mongodb';
import type { ConstituencyTableColumnSettings } from '@/lib/table-column-settings';
import {
  applyCellsToFlatFields,
  cellTextById,
  resolveVoterCells,
} from '@/lib/voter-cells';
import type { VoterBrowseRecord } from '@/lib/voter-browse-types';

/** Spreadsheet columns aligned with search-voters / printed voter list fields. */
export const SPREADSHEET_EDITABLE_FIELDS = [
  'silsilaNo',
  'blockCode',
  'gharanaNo',
  'fatherName',
  'cnic',
  'profession',
  'age',
  'address',
] as const;

export type SpreadsheetField = (typeof SPREADSHEET_EDITABLE_FIELDS)[number];

export const SPREADSHEET_SORTABLE_FIELDS = ['row', ...SPREADSHEET_EDITABLE_FIELDS] as const;

export type SpreadsheetSortField = (typeof SPREADSHEET_SORTABLE_FIELDS)[number];

export type SortDirection = 'asc' | 'desc';

export const SPREADSHEET_SORT_LABELS: Record<SpreadsheetSortField, string> = {
  row: 'Page row',
  silsilaNo: 'Silsila',
  blockCode: 'Block',
  gharanaNo: 'Name',
  fatherName: 'Father',
  cnic: 'CNIC',
  profession: 'Profession',
  age: 'Age',
  address: 'Address',
};

/** Fields shown RTL in the spreadsheet (Urdu list text). */
export const SPREADSHEET_RTL_FIELDS = new Set<SpreadsheetField>([
  'gharanaNo',
  'fatherName',
  'profession',
  'address',
]);

export const DEFAULT_SPREADSHEET_SORT = {
  sortBy: 'silsilaNo' as SpreadsheetSortField,
  sortDir: 'asc' as SortDirection,
};

export function isSpreadsheetSortField(value: string | null | undefined): value is SpreadsheetSortField {
  return SPREADSHEET_SORTABLE_FIELDS.includes(value as SpreadsheetSortField);
}

export function parseSortDirection(value: string | null | undefined): SortDirection {
  return value === 'desc' ? 'desc' : 'asc';
}

export function buildMongoSortFromSpreadsheet(
  sortBy: SpreadsheetSortField,
  sortDir: SortDirection
): Record<string, 1 | -1> {
  const direction = sortDir === 'desc' ? -1 : 1;
  return { [sortBy]: direction, _id: 1 };
}

const TEXT_SORT_FIELDS = new Set<SpreadsheetSortField>([
  'gharanaNo',
  'fatherName',
  'cnic',
  'profession',
  'address',
]);

export const VOTER_NATURAL_NUMERIC_SORT_COLLATION: CollationOptions = {
  locale: 'en',
  numericOrdering: true,
};

export function usesNaturalNumericSort(sortBy: SpreadsheetSortField): boolean {
  return !TEXT_SORT_FIELDS.has(sortBy);
}

export function voterSortCollation(sortBy: SpreadsheetSortField): CollationOptions | undefined {
  return usesNaturalNumericSort(sortBy) ? VOTER_NATURAL_NUMERIC_SORT_COLLATION : undefined;
}

export interface VoterBatchUpdate {
  id: string;
  silsilaNo?: string;
  blockCode?: string;
  gharanaNo?: string;
  fatherName?: string;
  cnic?: string;
  profession?: string;
  age?: string;
  address?: string;
}

export interface VoterBatchPayload {
  updates: VoterBatchUpdate[];
  deletes: string[];
}

export interface VoterBatchResult {
  message: string;
  updated: number;
  deleted: number;
  errors?: Array<{ id: string; error: string }>;
}

function firstNonEmpty(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const trimmed = String(value ?? '').trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return '';
}

/**
 * Resolve spreadsheet cell values the same way search-voters shows list data:
 * - gharanaNo holds the printed list "Name" column (OCR cell `name`)
 * - fatherName, profession, age, address match their list columns
 * - the concatenated voter.name blob is not used in the spreadsheet
 */
export function pickSpreadsheetFields(
  voter: VoterBrowseRecord,
  columnSettings?: ConstituencyTableColumnSettings | null
): Record<SpreadsheetField, string> {
  const cells = resolveVoterCells(voter, columnSettings ?? null);
  const fromCells = applyCellsToFlatFields(cells);

  return {
    silsilaNo: firstNonEmpty(voter.silsilaNo, fromCells.silsilaNo, cellTextById(cells, 'silsila_no')),
    blockCode: String(voter.blockCode ?? ''),
    gharanaNo: firstNonEmpty(voter.gharanaNo, cellTextById(cells, 'name'), fromCells.name),
    fatherName: firstNonEmpty(voter.fatherName, fromCells.fatherName, cellTextById(cells, 'father_name')),
    cnic: String(voter.cnic ?? ''),
    profession: firstNonEmpty(voter.profession, fromCells.profession, cellTextById(cells, 'profession')),
    age: firstNonEmpty(voter.age, fromCells.age, cellTextById(cells, 'age')),
    address: firstNonEmpty(voter.address, fromCells.address, cellTextById(cells, 'address')),
  };
}

export function buildBatchUpdates(
  originals: Record<string, Record<SpreadsheetField, string>>,
  edits: Record<string, Partial<Record<SpreadsheetField, string>>>
): VoterBatchUpdate[] {
  const updates: VoterBatchUpdate[] = [];

  for (const [id, changed] of Object.entries(edits)) {
    const original = originals[id];
    if (!original) continue;

    const payload: VoterBatchUpdate = { id };
    let hasChange = false;

    for (const field of SPREADSHEET_EDITABLE_FIELDS) {
      const nextValue = changed[field] ?? original[field];
      if (nextValue !== original[field]) {
        payload[field] = nextValue;
        hasChange = true;
      }
    }

    if (hasChange) {
      updates.push(payload);
    }
  }

  return updates;
}

export async function saveVoterBatch(payload: VoterBatchPayload): Promise<VoterBatchResult> {
  const response = await fetch('/api/voters/batch/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = (await response.json().catch(() => ({}))) as VoterBatchResult & { error?: string };

  if (!response.ok) {
    throw new Error(data.error || 'Failed to save changes');
  }

  return data;
}

export function normalizeVoterEditPayload(fields: Partial<Record<SpreadsheetField, string>>): VoterEditPayload {
  return {
    silsilaNo: fields.silsilaNo,
    blockCode: fields.blockCode,
    gharanaNo: fields.gharanaNo,
    name: fields.gharanaNo,
    fatherName: fields.fatherName,
    cnic: fields.cnic,
    profession: fields.profession,
    age: fields.age,
    address: fields.address,
  };
}
