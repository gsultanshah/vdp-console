import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { mapHeaders, hasRequiredColumns } from '@/lib/polling-scheme/column-map';
import type { NormalizedPollingSchemeRow, PollingSchemeRowType } from '@/lib/polling-scheme/types';

function cellValue(row: Record<string, unknown>, header?: string): string {
  if (!header) return '';
  const value = row[header];
  if (value == null) return '';
  return String(value).trim();
}

function parseNumber(value: string): number {
  if (!value) return 0;
  const cleaned = value.replace(/[^\d.-]/g, '');
  const num = Number.parseInt(cleaned, 10);
  return Number.isFinite(num) ? num : 0;
}

function inferStationGenderType(name: string): 'male' | 'female' | 'combined' {
  const lower = name.toLowerCase();
  if (lower.includes('(male)') || lower.includes(' male)') || lower.includes(' male ')) return 'male';
  if (lower.includes('(female)') || lower.includes(' female)') || lower.includes(' female ')) return 'female';
  if (name.includes('(مرد)') || name.includes('مرد')) return 'male';
  if (name.includes('(خواتین)') || name.includes('خواتین') || name.includes('عورت')) return 'female';
  return 'combined';
}

function inferRowType(raw: Record<string, unknown>, mapping: Record<string, string>): PollingSchemeRowType {
  const explicit = cellValue(raw, mapping.rowType);
  if (explicit) {
    const lower = explicit.toLowerCase();
    if (lower.includes('station total') || lower.includes('total')) return 'Station Total';
    if (lower.includes('page total')) return 'Page Total';
    if (lower.includes('detail')) return 'Detail';
  }

  const code = cellValue(raw, mapping.electoralRollCode);
  const area = cellValue(raw, mapping.areaName);
  if (!code && !area) return 'Station Total';
  if (!code) return 'Unknown';
  return 'Detail';
}

function normalizeRow(
  raw: Record<string, unknown>,
  mapping: Record<string, string>,
  defaults: { district?: string; page?: number | null }
): NormalizedPollingSchemeRow | null {
  const pollingStation = cellValue(raw, mapping.pollingStation);
  const electoralRollCode = cellValue(raw, mapping.electoralRollCode);
  const areaName = cellValue(raw, mapping.areaName);
  const rowType = inferRowType(raw, mapping);

  if (!pollingStation && !electoralRollCode && !areaName && rowType !== 'Station Total') {
    return null;
  }

  if (rowType === 'Detail' && !electoralRollCode) {
    return null;
  }

  const maleVoters = parseNumber(cellValue(raw, mapping.maleVoters));
  const femaleVoters = parseNumber(cellValue(raw, mapping.femaleVoters));
  const totalFromSheet = parseNumber(cellValue(raw, mapping.totalVoters));
  const totalVoters = totalFromSheet > 0 ? totalFromSheet : maleVoters + femaleVoters;

  const pageRaw = cellValue(raw, mapping.page);
  const page = pageRaw ? parseNumber(pageRaw) : defaults.page ?? null;

  const sourceRawText =
    cellValue(raw, mapping.sourceRawText) ||
    [
      cellValue(raw, mapping.slNo),
      pollingStation,
      areaName,
      electoralRollCode,
      String(maleVoters),
      String(femaleVoters),
      String(totalVoters),
    ]
      .filter(Boolean)
      .join(' ');

  return {
    page: page && page > 0 ? page : defaults.page ?? null,
    district: cellValue(raw, mapping.district) || defaults.district || '',
    slNo: cellValue(raw, mapping.slNo),
    pollingStation,
    areaType: cellValue(raw, mapping.areaType),
    areaName,
    electoralRollCode,
    maleVoters,
    femaleVoters,
    totalVoters,
    maleBooths: cellValue(raw, mapping.maleBooths),
    femaleBooths: cellValue(raw, mapping.femaleBooths),
    totalBooths: cellValue(raw, mapping.totalBooths),
    rowType,
    sourceRawText,
    stationType: inferStationGenderType(pollingStation),
  };
}

function readWorkbookRows(fileBuffer: Buffer, ext: string): Record<string, unknown>[] {
  if (ext === 'csv') {
    const csv = fileBuffer.toString('utf8').replace(/^\uFEFF/, '');
    const { data, errors } = Papa.parse<Record<string, unknown>>(csv, {
      header: true,
      skipEmptyLines: true,
    });
    if (errors.length > 0) {
      throw new Error(`CSV parse error: ${errors[0].message}`);
    }
    return data;
  }

  const workbook = XLSX.read(fileBuffer, {
    type: 'buffer',
    cellDates: false,
    codepage: 65001,
  });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('Workbook has no sheets');
  }
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, {
    defval: '',
    raw: false,
  }) as Record<string, unknown>[];
}

export function parsePollingSchemeSpreadsheet(input: {
  fileBuffer: Buffer;
  ext: string;
  district?: string;
}): NormalizedPollingSchemeRow[] {
  const rows = readWorkbookRows(input.fileBuffer, input.ext);
  if (!rows.length) {
    throw new Error('No data found in file.');
  }

  const headers = Object.keys(rows[0] ?? {});
  const mapping = mapHeaders(headers);
  const missing = hasRequiredColumns(mapping);
  if (missing.length > 0) {
    throw new Error(
      `Missing required columns: ${missing.join(', ')}. Supported headers include English and Urdu variants such as Polling Station, Electoral Roll Code, Male Voters, Female Voters, بلاک کوڈ, پولنگ اسٹیشن.`
    );
  }

  const normalized: NormalizedPollingSchemeRow[] = [];
  for (const raw of rows) {
    const row = normalizeRow(raw, mapping, { district: input.district });
    if (row) {
      normalized.push(row);
    }
  }

  if (!normalized.length) {
    throw new Error('No importable rows found. Detail rows need an Electoral Roll Code / blockcode.');
  }

  return normalized;
}
