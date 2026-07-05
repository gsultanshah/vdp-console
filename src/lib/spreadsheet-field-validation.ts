import type { SpreadsheetField } from '@/lib/voter-batch';

export type SpreadsheetFieldIssue = 'silsila' | 'age' | 'duplicate' | 'order';

export interface SpreadsheetIssueContext {
  voterId?: string;
  duplicateVoterIds?: Set<string>;
  orderIssueVoterIds?: Set<string>;
}

export function parseAgeDigits(value: string): number | null {
  const match = String(value ?? '').trim().match(/\d+/);
  if (!match) {
    return null;
  }
  return Number.parseInt(match[0], 10);
}

/** Valid silsila is a single non-empty integer with digits only (no letters, spaces, or symbols). */
export function isValidNumericSilsila(value: string): boolean {
  const trimmed = String(value ?? '').trim();
  return trimmed.length > 0 && /^\d+$/.test(trimmed);
}

/** Malformed serial: non-numeric ("сл 5", "- 23"), repeated token ("22 22"), or split ("00 8"). */
export function hasSilsilaIssue(value: string): boolean {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    return false;
  }

  return !isValidNumericSilsila(trimmed);
}

export function hasAgeIssue(value: string): boolean {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    return true;
  }

  if (/^(\d+)\s+\1$/.test(trimmed)) {
    return true;
  }

  const groups = trimmed.match(/\d+/g) ?? [];
  if (groups.length > 1) {
    return true;
  }

  const age = parseAgeDigits(trimmed);
  if (age == null) {
    return false;
  }

  return age < 18 || age > 99;
}

export function getSpreadsheetFieldIssues(
  fields: Partial<Record<SpreadsheetField, string>>,
  context?: SpreadsheetIssueContext
): SpreadsheetFieldIssue[] {
  const issues: SpreadsheetFieldIssue[] = [];
  if (hasSilsilaIssue(fields.silsilaNo ?? '')) {
    issues.push('silsila');
  }

  if (context?.voterId && context.duplicateVoterIds?.has(context.voterId)) {
    issues.push('duplicate');
  }

  if (context?.voterId && context.orderIssueVoterIds?.has(context.voterId)) {
    issues.push('order');
  }

  if (hasAgeIssue(fields.age ?? '')) {
    issues.push('age');
  }

  return issues;
}

export function hasSilsilaColumnIssue(issues: SpreadsheetFieldIssue[]): boolean {
  return issues.some((issue) => issue === 'silsila' || issue === 'duplicate' || issue === 'order');
}

export function normalizeExtractedSilsila(value: string): string {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    return '';
  }

  const duplicateMatch = trimmed.match(/^(\d+)\s+\1$/);
  if (duplicateMatch?.[1]) {
    return duplicateMatch[1];
  }

  const digitGroups = trimmed.match(/\d+/g) ?? [];
  if (digitGroups.length > 0) {
    return digitGroups[0] ?? '';
  }

  return trimmed.replace(/\s+/g, '');
}

/** Canonical silsila key for duplicate checks — "022" and "22" are the same. Invalid values return "". */
export function silsilaDuplicateKey(value: string): string {
  if (!isValidNumericSilsila(value)) {
    return '';
  }
  return String(Number.parseInt(String(value).trim(), 10));
}

export function normalizeExtractedAge(value: string): string {
  const digits = parseAgeDigits(value);
  if (digits == null) {
    return '';
  }
  return String(digits);
}
