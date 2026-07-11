export type CnicGender = 'male' | 'female';

const MALE_LAST_DIGITS = new Set(['1', '3', '5', '7', '9']);
const FEMALE_LAST_DIGITS = new Set(['0', '2', '4', '6', '8']);

export function genderFromCnic(cnic: string): CnicGender | null {
  const digits = cnic.replace(/\D/g, '');
  if (digits.length < 1) {
    return null;
  }

  const lastDigit = digits[digits.length - 1];
  if (MALE_LAST_DIGITS.has(lastDigit)) {
    return 'male';
  }
  if (FEMALE_LAST_DIGITS.has(lastDigit)) {
    return 'female';
  }

  return null;
}

export function formatGenderFromCnic(cnic: string): string | null {
  const gender = genderFromCnic(cnic);
  if (!gender) {
    return null;
  }
  return gender === 'male' ? 'Male' : 'Female';
}

export function normalizeCnicDigits(cnic: string): string {
  return cnic.replace(/\D/g, '');
}

/** Format 13-digit CNIC as XXXXX-XXXXXXX-X. Returns empty string if invalid length. */
export function formatCnicStandard(cnic: string): string {
  const digits = normalizeCnicDigits(cnic);
  if (digits.length !== 13) {
    return '';
  }
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
}

export function isValidCnic(cnic: string): boolean {
  return /^\d{5}-\d{7}-\d{1}$/.test(formatCnicStandard(cnic));
}

/** Regex that matches CNIC stored with or without dashes/spaces. */
export function buildFlexibleCnicRegex(cnic: string): string | null {
  const digits = normalizeCnicDigits(cnic);
  if (digits.length < 5) {
    return null;
  }

  const chunks = [digits.slice(0, 5)];
  if (digits.length > 5) {
    chunks.push(digits.slice(5, 12));
  }
  if (digits.length > 12) {
    chunks.push(digits.slice(12, 13));
  }

  return `^${chunks.map((chunk) => chunk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\-\\s]*')}$`;
}

export function isCnicLikeQuery(query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) {
    return false;
  }
  const digits = normalizeCnicDigits(trimmed);
  return digits.length >= 5 && /^[\d\s-]+$/.test(trimmed);
}

export type GenderFilter = 'both' | 'male' | 'female';

export function appendCnicGenderFilter(
  query: Record<string, unknown>,
  gender: GenderFilter
): void {
  if (gender === 'both') {
    return;
  }

  const genderClause = {
    cnic: { $regex: gender === 'male' ? '[13579]$' : '[02468]$' },
  };

  if (query.$or) {
    query.$and = [genderClause, { $or: query.$or }];
    delete query.$or;
    return;
  }

  Object.assign(query, genderClause);
}
