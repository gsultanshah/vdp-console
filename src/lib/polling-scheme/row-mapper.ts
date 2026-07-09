import type { ObjectId } from 'mongodb';

export interface PollingSchemeApiRow {
  id: string;
  page: number | null;
  district: string;
  sn: string;
  pollingStation: string;
  areaType: string;
  areaName: string;
  blockcode: string | number;
  male: number;
  female: number;
  total: number;
  maleBooth: string;
  femaleBooth: string;
  totalBooth: string;
  rowType: string;
  type: string;
  source: string;
  sourceFileName: string;
  sourceRawText: string;
  halkaName: string;
  importId: string | null;
}

export interface PollingSchemeRowInput {
  page?: number | null;
  district?: string;
  sn?: string;
  pollingStation?: string;
  areaType?: string;
  areaName?: string;
  blockcode?: string | number;
  male?: number;
  female?: number;
  total?: number;
  maleBooth?: string;
  femaleBooth?: string;
  totalBooth?: string;
  rowType?: string;
  type?: string;
  sourceRawText?: string;
}

function inferStationType(name: string): 'male' | 'female' | 'combined' {
  const lower = name.toLowerCase();
  if (lower.includes('(male)') || lower.includes(' male')) return 'male';
  if (lower.includes('(female)') || lower.includes(' female')) return 'female';
  if (name.includes('(مرد)') || name.includes('مرد')) return 'male';
  if (name.includes('(خواتین)') || name.includes('خواتین') || name.includes('عورت')) return 'female';
  return 'combined';
}

function parseBlockcode(value: string | number | undefined): number | string {
  if (value == null || value === '') return '';
  const numeric = Number.parseInt(String(value).replace(/[^\d]/g, ''), 10);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : String(value);
}

export function docToApiRow(doc: Record<string, unknown>): PollingSchemeApiRow {
  return {
    id: String(doc._id),
    page: typeof doc.page === 'number' ? doc.page : doc.page ? Number(doc.page) : null,
    district: String(doc.district ?? ''),
    sn: String(doc.sn ?? ''),
    pollingStation: String(doc.polling_station_name ?? ''),
    areaType: String(doc.areaType ?? ''),
    areaName: String(doc.area ?? ''),
    blockcode: (doc.blockcode as string | number) ?? '',
    male: Number(doc.male) || 0,
    female: Number(doc.female) || 0,
    total: Number(doc.total) || 0,
    maleBooth: String(doc.male_booth ?? ''),
    femaleBooth: String(doc.female_booth ?? ''),
    totalBooth: String(doc.total_booth ?? ''),
    rowType: String(doc.rowType ?? 'Detail'),
    type: String(doc.type ?? 'combined'),
    source: String(doc.source ?? 'manual'),
    sourceFileName: String(doc.sourceFileName ?? ''),
    sourceRawText: String(doc.sourceRawText ?? ''),
    halkaName: String(doc.halkaName ?? ''),
    importId: doc.importId ? String(doc.importId as ObjectId) : null,
  };
}

export function inputToDbDoc(
  input: PollingSchemeRowInput,
  halkaName: string,
  existing?: Record<string, unknown>
): Record<string, unknown> {
  const pollingStation = String(input.pollingStation ?? existing?.polling_station_name ?? '').trim();
  const male = Number(input.male ?? existing?.male ?? 0) || 0;
  const female = Number(input.female ?? existing?.female ?? 0) || 0;
  const totalInput = Number(input.total);
  const total = Number.isFinite(totalInput) && totalInput > 0 ? totalInput : male + female;
  const blockcode = parseBlockcode(input.blockcode ?? (existing?.blockcode as string | number | undefined));

  const stationType =
    input.type === 'male' || input.type === 'female' || input.type === 'combined'
      ? input.type
      : inferStationType(pollingStation);

  return {
    sn: String(input.sn ?? existing?.sn ?? ''),
    polling_station_name: pollingStation,
    area: String(input.areaName ?? existing?.area ?? ''),
    areaType: String(input.areaType ?? existing?.areaType ?? ''),
    blockcode,
    male,
    female,
    total,
    male_booth: String(input.maleBooth ?? existing?.male_booth ?? ''),
    female_booth: String(input.femaleBooth ?? existing?.female_booth ?? ''),
    total_booth: String(input.totalBooth ?? existing?.total_booth ?? ''),
    halkaName,
    type: stationType,
    page: input.page ?? existing?.page ?? null,
    district: String(input.district ?? existing?.district ?? ''),
    rowType: String(input.rowType ?? existing?.rowType ?? 'Detail'),
    sourceRawText: String(input.sourceRawText ?? existing?.sourceRawText ?? ''),
    source: String(existing?.source ?? 'manual'),
    sourceFileName: String(existing?.sourceFileName ?? ''),
    sourceFileUrl: existing?.sourceFileUrl ?? '',
    sourceStoragePath: existing?.sourceStoragePath ?? '',
    importId: existing?.importId ?? null,
    importedAt: existing?.importedAt ?? new Date(),
    updatedAt: new Date(),
  };
}

export function buildSearchFilter(halkaName: string, search: string): Record<string, unknown> {
  const filter: Record<string, unknown> = { halkaName };
  if (!search.trim()) return filter;

  const term = search.trim();
  const code = Number.parseInt(term.replace(/[^\d]/g, ''), 10);
  const or: Record<string, unknown>[] = [
    { polling_station_name: { $regex: term, $options: 'i' } },
    { area: { $regex: term, $options: 'i' } },
    { district: { $regex: term, $options: 'i' } },
    { sourceRawText: { $regex: term, $options: 'i' } },
    { sn: { $regex: term, $options: 'i' } },
    { rowType: { $regex: term, $options: 'i' } },
    { type: { $regex: term, $options: 'i' } },
  ];
  if (Number.isFinite(code) && code > 0) {
    or.push({ blockcode: code });
  }
  filter.$or = or;
  return filter;
}
