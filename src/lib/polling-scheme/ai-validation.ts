import type { NormalizedPollingSchemeRow } from '@/lib/polling-scheme/types';
import type {
  PollingSchemeAiExtractedRow,
  PollingSchemeAiPageExtraction,
  PollingSchemeAiStationContext,
} from '@/lib/polling-scheme/ai-job-types';

export interface ValidationIssue {
  level: 'warn' | 'error';
  message: string;
  rowIndex?: number;
}

function normalizeUtf8Text(value: string): string {
  return value.normalize('NFC').replace(/\u0000/g, '').trim();
}

function parseNumericBlockCode(code: string): string {
  let digits = code.replace(/[^\d]/g, '');
  if (!digits) return code.trim();
  // Common OCR miss on 7-digit electoral codes: 0070003 → 007003.
  if (digits.length === 6 && digits.startsWith('00')) {
    digits = `${digits.slice(0, 3)}0${digits.slice(3)}`;
  }
  return digits;
}

function toNonNegativeInt(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.round(value));
}

export function normalizeExtractedRow(
  row: PollingSchemeAiExtractedRow,
  page: number,
  district: string
): NormalizedPollingSchemeRow {
  const male = toNonNegativeInt(row.maleVoters);
  const female = toNonNegativeInt(row.femaleVoters);
  let total = toNonNegativeInt(row.totalVoters);
  if (male + female > 0 && total === 0) {
    total = male + female;
  }

  return {
    page,
    district: normalizeUtf8Text(district),
    slNo: normalizeUtf8Text(row.slNo),
    pollingStation: normalizeUtf8Text(row.pollingStation),
    areaType: normalizeUtf8Text(row.areaType),
    areaName: normalizeUtf8Text(row.areaName),
    electoralRollCode: row.electoralRollCode ? parseNumericBlockCode(row.electoralRollCode) : '',
    maleVoters: male,
    femaleVoters: female,
    totalVoters: total,
    maleBooths: normalizeUtf8Text(row.maleBooths),
    femaleBooths: normalizeUtf8Text(row.femaleBooths),
    totalBooths: normalizeUtf8Text(row.totalBooths),
    rowType: row.rowType,
    sourceRawText: normalizeUtf8Text(row.sourceRawText),
    stationType: row.stationType,
  };
}

export function validateExtractedPage(extraction: PollingSchemeAiPageExtraction): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const warning of extraction.warnings) {
    issues.push({ level: 'warn', message: warning });
  }

  extraction.rows.forEach((row, index) => {
    for (const warning of row.warnings) {
      issues.push({ level: 'warn', message: warning, rowIndex: index });
    }

    if (row.rowType === 'Detail' && row.electoralRollCode) {
      const code = parseNumericBlockCode(row.electoralRollCode);
      if (!/^\d+$/.test(code)) {
        issues.push({
          level: 'error',
          message: `Invalid block code "${row.electoralRollCode}"`,
          rowIndex: index,
        });
      }
    }

    const male = toNonNegativeInt(row.maleVoters);
    const female = toNonNegativeInt(row.femaleVoters);
    const total = toNonNegativeInt(row.totalVoters);
    if (male > 0 && female > 0 && total > 0 && male + female !== total) {
      issues.push({
        level: 'warn',
        message: `male (${male}) + female (${female}) != total (${total})`,
        rowIndex: index,
      });
    }

    if (row.rowType === 'Detail' && !row.pollingStation.trim()) {
      issues.push({
        level: 'error',
        message: 'Detail row missing polling station name',
        rowIndex: index,
      });
    }
  });

  const detailRows = extraction.rows.filter((row) => row.rowType === 'Detail');
  const stationTotals = extraction.rows.filter((row) => row.rowType === 'Station Total');

  for (const totalRow of stationTotals) {
    const matchingDetails = detailRows.filter(
      (row) =>
        normalizeUtf8Text(row.pollingStation) === normalizeUtf8Text(totalRow.pollingStation) ||
        (totalRow.slNo && row.slNo === totalRow.slNo)
    );
    if (!matchingDetails.length) {
      continue;
    }
    const sumMale = matchingDetails.reduce((acc, row) => acc + toNonNegativeInt(row.maleVoters), 0);
    const sumFemale = matchingDetails.reduce(
      (acc, row) => acc + toNonNegativeInt(row.femaleVoters),
      0
    );
    const sumTotal = matchingDetails.reduce((acc, row) => acc + toNonNegativeInt(row.totalVoters), 0);
    const totalMale = toNonNegativeInt(totalRow.maleVoters);
    const totalFemale = toNonNegativeInt(totalRow.femaleVoters);
    const totalVoters = toNonNegativeInt(totalRow.totalVoters);

    if (totalMale > 0 && sumMale > 0 && totalMale !== sumMale) {
      issues.push({
        level: 'warn',
        message: `Station total male (${totalMale}) differs from detail sum (${sumMale}) for ${totalRow.pollingStation}`,
      });
    }
    if (totalFemale > 0 && sumFemale > 0 && totalFemale !== sumFemale) {
      issues.push({
        level: 'warn',
        message: `Station total female (${totalFemale}) differs from detail sum (${sumFemale}) for ${totalRow.pollingStation}`,
      });
    }
    if (totalVoters > 0 && sumTotal > 0 && totalVoters !== sumTotal) {
      issues.push({
        level: 'warn',
        message: `Station total voters (${totalVoters}) differs from detail sum (${sumTotal}) for ${totalRow.pollingStation}`,
      });
    }
  }

  return issues;
}

export function buildRowFingerprint(
  halkaName: string,
  row: NormalizedPollingSchemeRow,
  stationType: string
): string {
  const parts = [
    halkaName.replace(/\s+/g, '').toUpperCase(),
    row.electoralRollCode || '',
    normalizeUtf8Text(row.pollingStation).toLowerCase(),
    normalizeUtf8Text(row.areaName).toLowerCase(),
    row.rowType,
    stationType,
  ];
  return parts.join('|');
}

export function buildExactDuplicateKey(
  jobId: string,
  page: number,
  pageImageHash: string,
  row: NormalizedPollingSchemeRow,
  stationType: string
): string {
  return [
    jobId,
    page,
    pageImageHash,
    buildRowFingerprint('', row, stationType),
  ].join('::');
}

export function pickStationContext(
  extraction: PollingSchemeAiPageExtraction
): PollingSchemeAiStationContext | null {
  if (extraction.stationContext?.pollingStation) {
    return extraction.stationContext;
  }

  const detailRows = extraction.rows.filter((row) => row.rowType === 'Detail' && row.pollingStation);
  if (!detailRows.length) {
    return null;
  }

  const last = detailRows[detailRows.length - 1];
  return {
    slNo: last.slNo,
    pollingStation: last.pollingStation,
    stationType: last.stationType,
    district: extraction.district,
  };
}

export function applyStationInheritance(
  rows: NormalizedPollingSchemeRow[],
  priorContext: PollingSchemeAiStationContext | null
): NormalizedPollingSchemeRow[] {
  let currentStation = priorContext?.pollingStation ?? '';
  let currentSlNo = priorContext?.slNo ?? '';
  let currentType = priorContext?.stationType ?? 'combined';
  let currentDistrict = priorContext?.district ?? '';

  return rows.map((row) => {
    if (row.pollingStation) {
      currentStation = row.pollingStation;
      currentSlNo = row.slNo || currentSlNo;
      currentType = row.stationType || currentType;
    } else if (currentStation) {
      row.pollingStation = currentStation;
      if (!row.slNo && currentSlNo) {
        row.slNo = currentSlNo;
      }
      if (!row.stationType) {
        row.stationType = currentType;
      }
    }
    if (!row.district && currentDistrict) {
      row.district = currentDistrict;
    }
    if (row.district) {
      currentDistrict = row.district;
    }
    return row;
  });
}
