import type { ParchiVoterRecord } from '@/lib/voter-parchi/types';

type VoterNameSource = Pick<
  ParchiVoterRecord,
  'name' | 'gharanaNo' | 'fatherName' | 'profession' | 'age' | 'address' | 'previousAddress'
>;

function hasNameLetters(value: string): boolean {
  return /[\u0600-\u06FFa-zA-Z]/.test(value);
}

function isHouseNumberOnly(value: string): boolean {
  return /^\d{1,4}$/.test(value.trim());
}

/** Remove Western and Eastern Arabic/Persian digits from display names. */
function stripDigitsFromName(value: string): string {
  return value
    .replace(/[\d\u0660-\u0669\u06F0-\u06F9]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** OCR stores the printed list name in gharanaNo; voter.name is often a search blob. */
export function resolveVoterDisplayName(voter: VoterNameSource): string {
  const listName = String(voter.gharanaNo ?? '').trim();
  if (listName && hasNameLetters(listName) && !isHouseNumberOnly(listName)) {
    const cleanedListName = stripDigitsFromName(listName);
    if (cleanedListName && hasNameLetters(cleanedListName)) {
      return cleanedListName;
    }
  }

  let text = String(voter.name ?? '').trim();
  if (!text) return listName;

  const father = String(voter.fatherName ?? '').trim();
  if (father && text.includes(father)) {
    text = text.slice(0, text.indexOf(father)).trim();
  }

  for (const part of [voter.profession, voter.address, voter.previousAddress]) {
    const segment = String(part ?? '').trim();
    if (segment.length >= 4 && text.includes(segment)) {
      text = text.slice(0, text.indexOf(segment)).trim();
    }
  }

  const age = String(voter.age ?? '').trim();
  if (age) {
    const agePatterns = [`${age} سال`, `${age}سال`, age];
    for (const pattern of agePatterns) {
      const idx = text.indexOf(pattern);
      if (idx > 0) {
        text = text.slice(0, idx).trim();
        break;
      }
    }
  }

  if (text) return stripDigitsFromName(text);
  return stripDigitsFromName(listName || String(voter.name ?? '').trim());
}
