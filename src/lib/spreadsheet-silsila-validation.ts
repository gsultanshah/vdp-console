import { genderFromCnic, type CnicGender } from '@/lib/cnic';
import { normalizeExtractedSilsila, isValidNumericSilsila, silsilaDuplicateKey } from '@/lib/spreadsheet-field-validation';

export interface SilsilaIndexEntry {
  id: string;
  silsilaNo: string;
  row?: number;
  pageKey?: string;
  cnic?: string;
}

export function parseSilsilaNumber(value: string): number | null {
  if (!isValidNumericSilsila(value)) {
    return null;
  }
  return Number.parseInt(String(value).trim(), 10);
}

export function silsilaGenderKey(cnic?: string): CnicGender | 'unknown' {
  return genderFromCnic(cnic ?? '') ?? 'unknown';
}

/** Duplicate silsila within the same gender (male/female) across the block. */
export function buildGenderSilsilaUsageMap(entries: SilsilaIndexEntry[]): Map<string, string[]> {
  const usage = new Map<string, string[]>();

  for (const entry of entries) {
    const silsila = silsilaDuplicateKey(entry.silsilaNo);
    if (!silsila) {
      continue;
    }

    const gender = silsilaGenderKey(entry.cnic);
    const composite = `${gender}::${silsila}`;
    const ids = usage.get(composite) ?? [];
    if (!ids.includes(entry.id)) {
      ids.push(entry.id);
    }
    usage.set(composite, ids);
  }

  return usage;
}

export function buildPageSilsilaUsageMap(entries: SilsilaIndexEntry[]): Map<string, string[]> {
  const usage = new Map<string, string[]>();

  for (const entry of entries) {
    const pageKey = entry.pageKey?.trim();
    const silsila = silsilaDuplicateKey(entry.silsilaNo);
    if (!pageKey || !silsila) {
      continue;
    }

    const composite = `${pageKey}::${silsila}`;
    const ids = usage.get(composite) ?? [];
    if (!ids.includes(entry.id)) {
      ids.push(entry.id);
    }
    usage.set(composite, ids);
  }

  return usage;
}

export function findDuplicateVoterIdsFromUsage(usage: Map<string, string[]>): Set<string> {
  const voterIds = new Set<string>();
  for (const ids of Array.from(usage.values())) {
    if (ids.length > 1) {
      for (const id of ids) {
        voterIds.add(id);
      }
    }
  }
  return voterIds;
}

/** @deprecated Use findDuplicateVoterIdsFromUsage */
export function findDuplicateVoterIdsFromPageUsage(usage: Map<string, string[]>): Set<string> {
  return findDuplicateVoterIdsFromUsage(usage);
}

export function buildSilsilaUsageMap(entries: SilsilaIndexEntry[]): Map<string, string[]> {
  const usage = new Map<string, string[]>();

  for (const entry of entries) {
    const silsila = silsilaDuplicateKey(entry.silsilaNo);
    if (!silsila) {
      continue;
    }
    const ids = usage.get(silsila) ?? [];
    if (!ids.includes(entry.id)) {
      ids.push(entry.id);
    }
    usage.set(silsila, ids);
  }

  return usage;
}

export function findDuplicateSilsilaNumbers(usage: Map<string, string[]>): Set<string> {
  const duplicates = new Set<string>();
  for (const [silsila, ids] of Array.from(usage.entries())) {
    if (ids.length > 1) {
      duplicates.add(silsila);
    }
  }
  return duplicates;
}

export function findDuplicateVoterIds(
  usage: Map<string, string[]>,
  duplicateSilsila: Set<string>
): Set<string> {
  const voterIds = new Set<string>();
  for (const silsila of Array.from(duplicateSilsila)) {
    for (const id of usage.get(silsila) ?? []) {
      voterIds.add(id);
    }
  }
  return voterIds;
}

function detectOrderIssuesOnPage(entries: SilsilaIndexEntry[]): Set<string> {
  const sorted = [...entries]
    .filter((entry) => entry.row != null && parseSilsilaNumber(entry.silsilaNo) != null)
    .sort((a, b) => (a.row ?? 0) - (b.row ?? 0));

  if (sorted.length < 2) {
    return new Set<string>();
  }

  const issues = new Set<string>();
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = parseSilsilaNumber(sorted[index - 1].silsilaNo)!;
    const current = parseSilsilaNumber(sorted[index].silsilaNo)!;
    if (current < previous) {
      issues.add(sorted[index].id);
    } else if (current === previous) {
      issues.add(sorted[index].id);
      issues.add(sorted[index - 1].id);
    }
  }

  return issues;
}

/** Detect silsila order breaks within each scanned page (same imageUrl). */
export function detectOrderIssueVoterIds(entries: SilsilaIndexEntry[]): Set<string> {
  const byPage = new Map<string, SilsilaIndexEntry[]>();

  for (const entry of entries) {
    const pageKey = entry.pageKey?.trim();
    if (!pageKey || entry.row == null) {
      continue;
    }
    const pageEntries = byPage.get(pageKey) ?? [];
    pageEntries.push(entry);
    byPage.set(pageKey, pageEntries);
  }

  const issues = new Set<string>();
  for (const pageEntries of Array.from(byPage.values())) {
    for (const voterId of Array.from(detectOrderIssuesOnPage(pageEntries))) {
      issues.add(voterId);
    }
  }

  return issues;
}

export function mergeSilsilaIndexWithEdits(
  entries: SilsilaIndexEntry[],
  overrides: Map<string, string>
): SilsilaIndexEntry[] {
  if (overrides.size === 0) {
    return entries;
  }

  return entries.map((entry) => {
    const override = overrides.get(entry.id);
    if (override == null) {
      return entry;
    }
    return { ...entry, silsilaNo: override };
  });
}

export function buildSilsilaValidationContext(entries: SilsilaIndexEntry[]): {
  duplicateVoterIds: Set<string>;
  orderIssueVoterIds: Set<string>;
  usage: Map<string, string[]>;
} {
  const usage = buildGenderSilsilaUsageMap(entries);
  const duplicateVoterIds = findDuplicateVoterIdsFromUsage(usage);
  const orderIssueVoterIds = detectOrderIssueVoterIds(entries);

  return {
    duplicateVoterIds,
    orderIssueVoterIds,
    usage,
  };
}

export function getNeighborSilsilaNumbers(
  entries: SilsilaIndexEntry[],
  voterId: string
): { before?: string; after?: string } {
  const target = entries.find((entry) => entry.id === voterId);
  if (!target) {
    return {};
  }

  const pageKey = target.pageKey ?? '';
  const pageEntries = entries
    .filter((entry) => (entry.pageKey ?? '') === pageKey && parseSilsilaNumber(entry.silsilaNo) != null)
    .sort((a, b) => (a.row ?? 0) - (b.row ?? 0));

  const index = pageEntries.findIndex((entry) => entry.id === voterId);
  if (index < 0) {
    return {};
  }

  return {
    before: index > 0 ? normalizeExtractedSilsila(pageEntries[index - 1].silsilaNo) : undefined,
    after:
      index < pageEntries.length - 1
        ? normalizeExtractedSilsila(pageEntries[index + 1].silsilaNo)
        : undefined,
  };
}
