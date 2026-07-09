import { extractPdfPages } from '@/lib/pdf-extract';
import { detectTextInImage } from '@/lib/google-vision-client';
import { prepareImageForVision } from '@/lib/vision-image';
import type { NormalizedPollingSchemeRow } from '@/lib/polling-scheme/types';

export type PollingSchemeRowType = 'Detail' | 'Station Total' | 'Page Total' | 'Unknown';

export interface ParsedPollingSchemeRow {
  page: number;
  district: string;
  slNo: number | null;
  pollingStation: string;
  areaType: string;
  areaName: string;
  electoralRollCode: string;
  maleVoters: number | null;
  femaleVoters: number | null;
  totalVoters: number | null;
  maleBooths: number | null;
  femaleBooths: number | null;
  totalBooths: number | null;
  rowType: PollingSchemeRowType;
  sourceRawText: string;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\r/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function safeInt(value: string | undefined): number | null {
  if (!value) return null;
  const num = Number.parseInt(value.replace(/[^\d]/g, ''), 10);
  return Number.isFinite(num) ? num : null;
}

function inferStationGenderType(name: string): 'male' | 'female' | 'combined' {
  const lower = name.toLowerCase();
  if (lower.includes('(male)') || lower.includes(' male)') || lower.includes(' male ')) return 'male';
  if (lower.includes('(female)') || lower.includes(' female)') || lower.includes(' female ')) return 'female';
  return 'combined';
}

function inferAreaType(areaName: string): string {
  const cleaned = areaName.trim();
  if (!cleaned) return '';
  if (/[Ww]ard/.test(cleaned) || cleaned.includes('وارڈ')) return 'Ward/Mohalla/Street';
  if (cleaned.includes('موضع') || cleaned.toLowerCase().includes('mauza')) return 'Mauza';
  if (cleaned.includes('گاؤں') || cleaned.toLowerCase().includes('village')) return 'Village';
  return 'Ward/Mohalla/Street';
}

function parseLineToRow(input: {
  line: string;
  page: number;
  district: string;
  currentStation?: { slNo: number | null; name: string } | null;
}): { row: ParsedPollingSchemeRow | null; station?: { slNo: number | null; name: string } | null } {
  const raw = input.line.trim();
  if (!raw) return { row: null, station: input.currentStation ?? null };

  const district = input.district;
  const page = input.page;

  const stationTotalMatch = raw.match(
    /^(?:Total|Station\s*Total)\s+(\d+)\s+(\d+)\s+(\d+)(?:\s+(\d+)\s+(\d+)\s+(\d+))?/i
  );
  if (stationTotalMatch) {
    return {
      row: {
        page,
        district,
        slNo: input.currentStation?.slNo ?? null,
        pollingStation: input.currentStation?.name ?? '',
        areaType: '',
        areaName: '',
        electoralRollCode: '',
        maleVoters: safeInt(stationTotalMatch[1]),
        femaleVoters: safeInt(stationTotalMatch[2]),
        totalVoters: safeInt(stationTotalMatch[3]),
        maleBooths: safeInt(stationTotalMatch[4]),
        femaleBooths: safeInt(stationTotalMatch[5]),
        totalBooths: safeInt(stationTotalMatch[6]),
        rowType: 'Station Total',
        sourceRawText: raw,
      },
      station: input.currentStation ?? null,
    };
  }

  const detailMatch = raw.match(
    /^(\d+)\s+(.+?)\s+(.+?)\s+(\d{6,})\s+(\d+)\s+(\d+)\s+(\d+)(?:\s+(\d+)\s+(\d+)\s+(\d+))?\s*$/
  );
  if (detailMatch) {
    const slNo = safeInt(detailMatch[1]);
    const stationName = (detailMatch[2] ?? '').trim();
    const areaName = (detailMatch[3] ?? '').trim();
    const row: ParsedPollingSchemeRow = {
      page,
      district,
      slNo,
      pollingStation: stationName,
      areaType: inferAreaType(areaName),
      areaName,
      electoralRollCode: String(detailMatch[4] ?? '').trim(),
      maleVoters: safeInt(detailMatch[5]),
      femaleVoters: safeInt(detailMatch[6]),
      totalVoters: safeInt(detailMatch[7]),
      maleBooths: safeInt(detailMatch[8]),
      femaleBooths: safeInt(detailMatch[9]),
      totalBooths: safeInt(detailMatch[10]),
      rowType: 'Detail',
      sourceRawText: raw,
    };
    return { row, station: { slNo, name: stationName } };
  }

  return {
    row: {
      page,
      district,
      slNo: input.currentStation?.slNo ?? null,
      pollingStation: input.currentStation?.name ?? '',
      areaType: '',
      areaName: '',
      electoralRollCode: '',
      maleVoters: null,
      femaleVoters: null,
      totalVoters: null,
      maleBooths: null,
      femaleBooths: null,
      totalBooths: null,
      rowType: 'Unknown',
      sourceRawText: raw,
    },
    station: input.currentStation ?? null,
  };
}

function parsePageTextToRows(text: string, page: number, district: string): ParsedPollingSchemeRow[] {
  const normalized = normalizeWhitespace(text);
  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => Boolean(line));

  const rows: ParsedPollingSchemeRow[] = [];
  let currentStation: { slNo: number | null; name: string } | null = null;

  for (const line of lines) {
    const parsed = parseLineToRow({ line, page, district, currentStation });
    if (parsed.station && parsed.station.name) {
      currentStation = parsed.station;
    }
    if (parsed.row) {
      rows.push(parsed.row);
    }
  }

  return rows;
}

export async function parsePollingSchemePdf(input: {
  pdfBuffer: Buffer;
  blockCodeHint?: string;
  district?: string;
}): Promise<NormalizedPollingSchemeRow[]> {
  const blockCode = input.blockCodeHint?.trim() || 'polling-scheme';
  const district = (input.district ?? '').trim();
  const pages = await extractPdfPages(input.pdfBuffer, blockCode);

  const results: NormalizedPollingSchemeRow[] = [];
  for (const page of pages) {
    const visionImage = await prepareImageForVision(page.buffer);
    const vision = await detectTextInImage(visionImage.toString('base64'));
    const text = vision.textAnnotations?.[0]?.description ?? '';
    if (!text.trim()) {
      continue;
    }

    const parsedRows = parsePageTextToRows(text, page.pageNumber, district);
    for (const row of parsedRows) {
      if (row.rowType === 'Unknown' && !row.electoralRollCode && !row.pollingStation) {
        continue;
      }
      results.push({
        page: row.page,
        district: row.district,
        slNo: row.slNo == null ? '' : String(row.slNo),
        pollingStation: row.pollingStation,
        areaType: row.areaType,
        areaName: row.areaName,
        electoralRollCode: row.electoralRollCode,
        maleVoters: row.maleVoters ?? 0,
        femaleVoters: row.femaleVoters ?? 0,
        totalVoters: row.totalVoters ?? (row.maleVoters ?? 0) + (row.femaleVoters ?? 0),
        maleBooths: row.maleBooths == null ? '' : String(row.maleBooths),
        femaleBooths: row.femaleBooths == null ? '' : String(row.femaleBooths),
        totalBooths: row.totalBooths == null ? '' : String(row.totalBooths),
        rowType: row.rowType,
        sourceRawText: row.sourceRawText,
        stationType: inferStationGenderType(row.pollingStation),
      });
    }
  }

  return results;
}

export function derivePollingStationType(name: string): 'male' | 'female' | 'combined' {
  return inferStationGenderType(name);
}

