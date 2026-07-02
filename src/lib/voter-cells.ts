import type { OcrRowElement } from '@/lib/ocr-types';
import {
  ratiosToPixelColumns,
  type ConstituencyTableColumnSettings,
  type TableColumnDefinition,
} from '@/lib/table-column-settings';
import {
  buildRowCells,
  type DetectedTableColumn,
  type OcrCropRect,
  type OcrVoterTableCell,
} from '@/lib/voter-table-extraction';
import type { VoterReproductionData } from '@/lib/voter-document';

export interface VoterTableCell {
  id: string;
  label: string;
  text: string;
}

export const CELL_FIELD_PREFIX = 'cell:';

export function cellFieldId(columnId: string): string {
  return `${CELL_FIELD_PREFIX}${columnId}`;
}

export function isCellFieldId(fieldId: string): boolean {
  return fieldId.startsWith(CELL_FIELD_PREFIX);
}

export function columnIdFromFieldId(fieldId: string): string {
  return fieldId.slice(CELL_FIELD_PREFIX.length);
}

export function toStoredCells(cells: OcrVoterTableCell[]): VoterTableCell[] {
  return cells.map((cell) => ({
    id: cell.id,
    label: cell.label,
    text: cell.text,
  }));
}

export function mergeTableColumnDefinitions(
  settingsList: Array<ConstituencyTableColumnSettings | null | undefined>
): TableColumnDefinition[] {
  const byId = new Map<string, TableColumnDefinition>();

  for (const settings of settingsList) {
    for (const column of settings?.columns ?? []) {
      const existing = byId.get(column.id);
      if (!existing || column.label.trim().length > existing.label.trim().length) {
        byId.set(column.id, column);
      }
    }
  }

  return Array.from(byId.values()).sort((a, b) => a.index - b.index || a.minXRatio - b.minXRatio);
}

export function buildCellsFromReproduction(
  reproduction: VoterReproductionData,
  cnic: string,
  columnSettings: ConstituencyTableColumnSettings | null | undefined
): VoterTableCell[] {
  const columns: DetectedTableColumn[] = columnSettings?.columns?.length
    ? ratiosToPixelColumns(columnSettings.columns, reproduction.pageWidth)
    : reproduction.voterTableMeta?.columns ?? [];

  if (!columns.length || !reproduction.elements?.length) {
    return [];
  }

  const ocrCells = buildRowCells(
    reproduction.elements,
    cnic,
    reproduction.band as OcrCropRect,
    columns
  );
  return toStoredCells(ocrCells);
}

export function resolveVoterCells(
  voter: {
    cells?: VoterTableCell[] | null;
    reproduction?: VoterReproductionData | null;
    cnic: string;
  },
  columnSettings?: ConstituencyTableColumnSettings | null
): VoterTableCell[] {
  if (voter.cells?.length) {
    return voter.cells;
  }

  if (voter.reproduction?.elements?.length) {
    return buildCellsFromReproduction(voter.reproduction, voter.cnic, columnSettings ?? null);
  }

  return [];
}

export function cellTextById(cells: VoterTableCell[], columnId: string): string {
  return cells.find((cell) => cell.id === columnId)?.text ?? '';
}

export function applyCellsToFlatFields(
  cells: VoterTableCell[]
): Partial<{
  silsilaNo: string;
  name: string;
  fatherName: string;
  profession: string;
  age: string;
  address: string;
  previousAddress: string;
}> {
  const byId = Object.fromEntries(cells.map((cell) => [cell.id, cell.text]));
  return {
    silsilaNo: byId.silsila_no || undefined,
    name: byId.name || undefined,
    fatherName: byId.father_name || undefined,
    profession: byId.profession || undefined,
    age: byId.age || undefined,
    address: byId.address || undefined,
    previousAddress: byId.previous_address || undefined,
  };
}

export function buildExportFieldsWithTableColumns(
  tableColumns: TableColumnDefinition[],
  baseFieldIds: string[] = ['cnic', 'phone', 'halkaName', 'blockCode']
): string[] {
  const base = baseFieldIds.filter(Boolean);
  const cellFields = tableColumns.map((column) => cellFieldId(column.id));
  const trailing = ['gender', 'religion', 'fileName', 'pageTag'].filter(
    (fieldId) => !base.includes(fieldId) && !cellFields.includes(cellFieldId(fieldId))
  );
  return [...base, ...cellFields, ...trailing];
}

export function exportLabelForField(
  fieldId: string,
  tableColumns: TableColumnDefinition[]
): string {
  if (isCellFieldId(fieldId)) {
    const columnId = columnIdFromFieldId(fieldId);
    const column = tableColumns.find((item) => item.id === columnId);
    return column?.label ?? columnId;
  }

  const labels: Record<string, string> = {
    cnic: 'CNIC',
    phone: 'Phone number',
    halkaName: 'Halka',
    blockCode: 'Block code',
    silsilaNo: 'Silsila no',
    gharanaNo: 'Gharana no',
    name: 'Name',
    fatherName: 'Father / relation',
    profession: 'Profession',
    age: 'Age',
    address: 'Address',
    previousAddress: 'Previous address',
    gender: 'Gender',
    religion: 'Religion',
    fileName: 'Source file',
    pageTag: 'Page tag',
  };

  return labels[fieldId] ?? fieldId;
}

export type VoterLikeForCells = {
  cells?: VoterTableCell[] | null;
  reproduction?: VoterReproductionData | null;
  cnic: string;
  halkaName?: string;
  fatherName?: string;
  profession?: string;
  age?: string;
  address?: string;
  previousAddress?: string;
  silsilaNo?: string;
  name?: string;
};

export function getCellValueForExport(
  voter: VoterLikeForCells,
  fieldId: string,
  columnSettingsByHalka: Map<string, ConstituencyTableColumnSettings | null>
): string {
  if (!isCellFieldId(fieldId)) {
    return '';
  }

  const columnId = columnIdFromFieldId(fieldId);
  const settings = voter.halkaName ? columnSettingsByHalka.get(voter.halkaName) ?? null : null;
  const cells = resolveVoterCells(voter, settings);
  const fromCell = cellTextById(cells, columnId);
  if (fromCell) {
    return fromCell;
  }

  const flat = applyCellsToFlatFields(cells);
  const fallback: Record<string, string | undefined> = {
    silsila_no: voter.silsilaNo,
    name: voter.name,
    father_name: voter.fatherName ?? flat.fatherName,
    profession: voter.profession ?? flat.profession,
    age: voter.age ?? flat.age,
    address: voter.address ?? flat.address,
    previous_address: voter.previousAddress ?? flat.previousAddress,
    cnic: voter.cnic,
  };

  return fallback[columnId] ?? '';
}
