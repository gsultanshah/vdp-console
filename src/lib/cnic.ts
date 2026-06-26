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
