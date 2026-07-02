export interface TableColumnDefinition {
  id: string;
  label: string;
  minXRatio: number;
  maxXRatio: number;
  index: number;
}

export interface ConstituencyTableColumnSettings {
  columns: TableColumnDefinition[];
  sourcePageId?: string;
  updatedAt?: string;
}

export interface BlockCodeTableColumnSettings extends ConstituencyTableColumnSettings {
  blockCode: string;
}

export const BLOCKCODE_PAGE_SAMPLE_LIMIT = 10;

export const KNOWN_COLUMN_IDS = [
  'silsila_no',
  'name',
  'father_name',
  'cnic',
  'profession',
  'age',
  'address',
  'previous_address',
] as const;

export function normalizeColumnDefinitions(
  columns: TableColumnDefinition[]
): TableColumnDefinition[] {
  return columns
    .map((column, index) => ({
      id: column.id.trim() || `col_${index}`,
      label: column.label.trim() || `Column ${index + 1}`,
      minXRatio: clampRatio(column.minXRatio),
      maxXRatio: clampRatio(column.maxXRatio),
      index,
    }))
    .sort((a, b) => a.minXRatio - b.minXRatio)
    .map((column, index) => ({ ...column, index }));
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function validateColumnDefinitions(columns: TableColumnDefinition[]): string | null {
  if (!columns.length) {
    return 'At least one column is required';
  }

  const normalized = normalizeColumnDefinitions(columns);
  for (const column of normalized) {
    if (column.maxXRatio <= column.minXRatio) {
      return `Column "${column.label}" has invalid bounds`;
    }
  }

  return null;
}

export function ratiosToPixelColumns(
  columns: TableColumnDefinition[],
  pageWidth: number
): Array<{ id: string; label: string; minX: number; maxX: number; index: number }> {
  return normalizeColumnDefinitions(columns).map((column) => ({
    id: column.id,
    label: column.label,
    minX: Math.round(column.minXRatio * pageWidth),
    maxX: Math.round(column.maxXRatio * pageWidth),
    index: column.index,
  }));
}

export function pixelColumnsToRatios(
  columns: Array<{ id: string; label: string; minX: number; maxX: number; index: number }>,
  pageWidth: number
): TableColumnDefinition[] {
  const width = Math.max(1, pageWidth);
  return columns.map((column, index) => ({
    id: column.id,
    label: column.label,
    minXRatio: column.minX / width,
    maxXRatio: column.maxX / width,
    index: column.index ?? index,
  }));
}
