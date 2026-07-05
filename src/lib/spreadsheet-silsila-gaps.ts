import { parseSilsilaNumber, type SilsilaIndexEntry } from '@/lib/spreadsheet-silsila-validation';

export interface SilsilaGapReport {
  scopeLabel: string;
  pageKey?: string;
  min: number;
  max: number;
  expectedCount: number;
  presentCount: number;
  missing: number[];
}

export function findMissingSilsilaNumbers(numbers: number[]): number[] {
  if (numbers.length < 2) {
    return [];
  }

  const unique = Array.from(new Set(numbers)).sort((a, b) => a - b);
  const min = unique[0];
  const max = unique[unique.length - 1];
  const present = new Set(unique);
  const missing: number[] = [];

  for (let value = min; value <= max; value += 1) {
    if (!present.has(value)) {
      missing.push(value);
    }
  }

  return missing;
}

export function pageLabelFromKey(pageKey: string): string {
  const trimmed = pageKey.trim();
  if (!trimmed) {
    return 'Unknown page';
  }

  try {
    const url = new URL(trimmed);
    const segment = url.pathname.split('/').filter(Boolean).pop();
    if (segment) {
      return decodeURIComponent(segment);
    }
  } catch {
    // Not a URL — fall through.
  }

  if (trimmed.length > 48) {
    return `${trimmed.slice(0, 48)}…`;
  }
  return trimmed;
}

function buildGapReport(
  scopeLabel: string,
  numbers: number[],
  pageKey?: string
): SilsilaGapReport | null {
  const missing = findMissingSilsilaNumbers(numbers);
  if (missing.length === 0) {
    return null;
  }

  const unique = Array.from(new Set(numbers));
  const min = Math.min(...unique);
  const max = Math.max(...unique);

  return {
    scopeLabel,
    pageKey,
    min,
    max,
    expectedCount: max - min + 1,
    presentCount: unique.length,
    missing,
  };
}

/** Check each scanned page has every serial from its lowest to highest silsila. */
export function analyzeSilsilaGapsByPage(entries: SilsilaIndexEntry[]): SilsilaGapReport[] {
  const byPage = new Map<string, number[]>();

  for (const entry of entries) {
    const pageKey = entry.pageKey?.trim();
    const silsila = parseSilsilaNumber(entry.silsilaNo);
    if (!pageKey || silsila == null) {
      continue;
    }

    const numbers = byPage.get(pageKey) ?? [];
    numbers.push(silsila);
    byPage.set(pageKey, numbers);
  }

  const reports: SilsilaGapReport[] = [];
  for (const [pageKey, numbers] of Array.from(byPage.entries())) {
    const report = buildGapReport(pageLabelFromKey(pageKey), numbers, pageKey);
    if (report) {
      reports.push(report);
    }
  }

  return reports.sort((a, b) => a.scopeLabel.localeCompare(b.scopeLabel));
}

/** Check the whole filtered set spans a complete serial range (lowest → highest). */
export function analyzeBlockSilsilaGaps(
  entries: SilsilaIndexEntry[],
  scopeLabel: string
): SilsilaGapReport | null {
  const numbers: number[] = [];

  for (const entry of entries) {
    const silsila = parseSilsilaNumber(entry.silsilaNo);
    if (silsila != null) {
      numbers.push(silsila);
    }
  }

  return buildGapReport(scopeLabel, numbers);
}

export function formatMissingSilsilaList(missing: number[], limit = 24): string {
  if (missing.length <= limit) {
    return missing.join(', ');
  }

  const shown = missing.slice(0, limit);
  return `${shown.join(', ')} … +${missing.length - limit} more`;
}

export function totalMissingCount(reports: SilsilaGapReport[]): number {
  return reports.reduce((sum, report) => sum + report.missing.length, 0);
}
