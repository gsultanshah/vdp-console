export const MAX_EXPORT_FILE_BYTES = 100 * 1024 * 1024;
export const EXPORT_FILE_SIZE_UI_MB = 100;
export const MAX_EXPORT_FILE_MB = MAX_EXPORT_FILE_BYTES / (1024 * 1024);
export const EXPORT_BATCH_SIZE = 150;
export const EXPORT_STALE_MS = 5 * 60 * 1000;

export interface ExportFieldDefinition {
  id: string;
  label: string;
  default: boolean;
}

export const EXPORT_FIELD_DEFINITIONS: ExportFieldDefinition[] = [
  { id: 'name', label: 'Name', default: true },
  { id: 'cnic', label: 'CNIC', default: true },
  { id: 'phone', label: 'Phone number', default: true },
  { id: 'halkaName', label: 'Halka', default: false },
  { id: 'blockCode', label: 'Block code', default: false },
  { id: 'silsilaNo', label: 'Silsila no', default: false },
  { id: 'gharanaNo', label: 'Gharana no', default: false },
  { id: 'fatherName', label: 'Father / relation', default: false },
  { id: 'profession', label: 'Profession', default: false },
  { id: 'age', label: 'Age', default: false },
  { id: 'address', label: 'Address', default: false },
  { id: 'gender', label: 'Gender', default: false },
  { id: 'religion', label: 'Religion', default: false },
  { id: 'fileName', label: 'Source file', default: false },
  { id: 'pageTag', label: 'Page tag', default: false },
];

export const DEFAULT_EXPORT_FIELD_IDS = EXPORT_FIELD_DEFINITIONS.filter((field) => field.default).map(
  (field) => field.id
);

export type ExportFormat = 'csv' | 'xlsx';
export type ExportMode = 'custom' | 'default_per_blockcode';
export type ExportJobStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'size_exceeded';

export function normalizeExportFields(fields: string[] | undefined): string[] {
  const allowed = new Set(EXPORT_FIELD_DEFINITIONS.map((field) => field.id));
  const normalized = (fields ?? DEFAULT_EXPORT_FIELD_IDS).filter((field) => allowed.has(field));
  return normalized.length ? normalized : [...DEFAULT_EXPORT_FIELD_IDS];
}

export function exportFieldLabel(fieldId: string): string {
  return EXPORT_FIELD_DEFINITIONS.find((field) => field.id === fieldId)?.label ?? fieldId;
}
