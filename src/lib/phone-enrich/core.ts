import type { Db } from 'mongodb';
import { buildFlexibleCnicRegex } from '@/lib/cnic';
import { normalizeHalkaForCompare } from '@/lib/constituency-access';
import {
  formatCnicDisplay,
  formatPhoneDisplay,
  isPhoneDataConfigured,
  normalizeCnicDigits,
  searchPhoneDataByCnic,
} from '@/lib/phone-data';

export const PHONE_ENRICH_MAX_INPUT_ROWS = 10_000;
export const PHONE_ENRICH_MAX_OUTPUT_ROWS = 10_000;
export const PHONE_ENRICH_BATCH_SIZE = 50;
export const PHONE_ENRICH_CLI_PART_SIZE = 10_000;

export type InputRow = Record<string, unknown>;
export type EnrichedRow = Record<string, string>;

export type PhoneRecordLite = {
  phone: string;
  phoneDisplay: string;
  firstname: string;
  gender: string;
  address1: string;
  address2: string;
  address3: string;
  sourceFile: string;
  dataJson: string;
};

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

export function getRowCnic(row: InputRow): string {
  const keys = Object.keys(row);
  const map = new Map(keys.map((k) => [normalizeHeader(k), k]));
  const candidates = ['cnic', 'idcard', 'nic', 'شناختی کارڈ', 'شناختیکارڈ', 'شناختی_کارڈ', 'cnicnumber'];
  for (const c of candidates) {
    const key = map.get(normalizeHeader(c));
    if (key) {
      const val = row[key];
      if (val != null) return String(val);
    }
  }
  for (const key of keys) {
    const digits = String(row[key] ?? '').replace(/\D/g, '');
    if (digits.length === 13) return String(row[key]);
  }
  return '';
}

export function getRowHalka(row: InputRow): string {
  const keys = Object.keys(row);
  const map = new Map(keys.map((k) => [normalizeHeader(k), k]));
  const key = map.get('halka') ?? map.get('halkaname') ?? map.get('constituency');
  if (!key) return '';
  return String(row[key] ?? '');
}

export function safeString(value: unknown): string {
  return value == null ? '' : String(value);
}

export function emptyPhoneFields(): Pick<
  EnrichedRow,
  | 'Phone'
  | 'PhoneDisplay'
  | 'PhoneFirstname'
  | 'PhoneGender'
  | 'PhoneAddress1'
  | 'PhoneAddress2'
  | 'PhoneAddress3'
  | 'PhoneSourceFile'
  | 'PhoneDataJson'
> {
  return {
    Phone: '',
    PhoneDisplay: '',
    PhoneFirstname: '',
    PhoneGender: '',
    PhoneAddress1: '',
    PhoneAddress2: '',
    PhoneAddress3: '',
    PhoneSourceFile: '',
    PhoneDataJson: '',
  };
}

export async function lookupPhoneRecords(
  cnic: string,
  cache: Map<string, PhoneRecordLite[]>
): Promise<PhoneRecordLite[]> {
  const normalized = normalizeCnicDigits(cnic);
  if (!normalized) return [];
  if (cache.has(normalized)) return cache.get(normalized)!;

  if (!isPhoneDataConfigured()) {
    cache.set(normalized, []);
    return [];
  }

  try {
    const records = await searchPhoneDataByCnic(normalized);
    const mapped = records.map((r) => ({
      phone: r.phone,
      phoneDisplay: formatPhoneDisplay(r.phone),
      firstname: safeString(r.firstname),
      gender: safeString(r.gender),
      address1: safeString(r.address1),
      address2: safeString(r.address2),
      address3: safeString(r.address3),
      sourceFile: safeString(r.sourceFile),
      dataJson: (() => {
        try {
          return JSON.stringify(r.data ?? {});
        } catch {
          return '';
        }
      })(),
    }));
    cache.set(normalized, mapped);
    return mapped;
  } catch {
    cache.set(normalized, []);
    return [];
  }
}

export async function lookupVoterByCnic(
  db: Db,
  cnic: string,
  allowedHalka: string | null,
  rowHalka: string
): Promise<Record<string, unknown> | null> {
  const pattern = buildFlexibleCnicRegex(cnic);
  if (!pattern) return null;
  const query: Record<string, unknown> = { cnic: { $regex: pattern, $options: 'i' } };
  const halka = rowHalka.trim();
  if (halka) {
    query.halkaName = normalizeHalkaForCompare(halka);
  } else if (allowedHalka) {
    query.halkaName = allowedHalka;
  }
  return db.collection('voters').findOne(query, {
    projection: {
      _id: 1,
      cnic: 1,
      halkaName: 1,
      blockCode: 1,
      silsilaNo: 1,
      gharanaNo: 1,
      name: 1,
      fatherName: 1,
      profession: 1,
      age: 1,
      address: 1,
      previousAddress: 1,
    },
  });
}

export function buildEnrichedRowsForInput(
  row: InputRow,
  options: {
    voter: Record<string, unknown> | null;
    phoneRecords: PhoneRecordLite[];
    forbiddenHalka?: boolean;
  }
): EnrichedRow[] {
  const inputCnicRaw = getRowCnic(row);
  const inputCnicDigits = normalizeCnicDigits(String(inputCnicRaw ?? ''));
  const halkaFromRow = getRowHalka(row);
  const cnicDisplay = inputCnicDigits ? formatCnicDisplay(inputCnicDigits) : safeString(inputCnicRaw);
  const voter = options.voter;

  const base: EnrichedRow = {
    CNIC: cnicDisplay,
    Name: voter ? safeString(voter.name) : '',
    Address: voter ? safeString(voter.address) : '',
    Halka: voter ? safeString(voter.halkaName) : halkaFromRow,
    BlockCode: voter ? safeString(voter.blockCode) : '',
    SilsilaNo: voter ? safeString(voter.silsilaNo) : '',
    GharanaNo: voter ? safeString(voter.gharanaNo) : '',
    FatherName: voter ? safeString(voter.fatherName) : '',
    Profession: voter ? safeString(voter.profession) : '',
    Age: voter ? safeString(voter.age) : '',
    PreviousAddress: voter ? safeString(voter.previousAddress) : '',
    ...emptyPhoneFields(),
    Error: '',
  };

  if (options.forbiddenHalka) {
    return [{ ...base, Error: 'Forbidden halka' }];
  }

  if (!inputCnicDigits) {
    return [{ ...base, Error: 'Invalid CNIC' }];
  }

  if (options.phoneRecords.length === 0) {
    return [base];
  }

  return options.phoneRecords.map((record) => ({
    ...base,
    Phone: record.phone,
    PhoneDisplay: record.phoneDisplay,
    PhoneFirstname: record.firstname,
    PhoneGender: record.gender,
    PhoneAddress1: record.address1,
    PhoneAddress2: record.address2,
    PhoneAddress3: record.address3,
    PhoneSourceFile: record.sourceFile,
    PhoneDataJson: record.dataJson,
  }));
}

export async function enrichInputRows(
  db: Db,
  rows: InputRow[],
  options: {
    allowedHalka: string | null;
    phoneCache: Map<string, PhoneRecordLite[]>;
    canAccessHalka?: (halka: string) => boolean;
    maxOutputRows?: number;
  }
): Promise<{ rows: EnrichedRow[]; outputLimitExceeded: boolean }> {
  const outRows: EnrichedRow[] = [];
  const maxOutput = options.maxOutputRows ?? PHONE_ENRICH_MAX_OUTPUT_ROWS;

  for (const row of rows) {
    const inputCnicDigits = normalizeCnicDigits(getRowCnic(row));
    const halkaFromRow = getRowHalka(row);

    if (halkaFromRow.trim() && options.canAccessHalka && !options.canAccessHalka(halkaFromRow)) {
      outRows.push(...buildEnrichedRowsForInput(row, { voter: null, phoneRecords: [], forbiddenHalka: true }));
      continue;
    }

    const phoneRecords = inputCnicDigits
      ? await lookupPhoneRecords(inputCnicDigits, options.phoneCache)
      : [];
    const voter = inputCnicDigits
      ? await lookupVoterByCnic(db, inputCnicDigits, options.allowedHalka, halkaFromRow)
      : null;

    outRows.push(...buildEnrichedRowsForInput(row, { voter, phoneRecords }));

    if (outRows.length > maxOutput) {
      return { rows: outRows.slice(0, maxOutput), outputLimitExceeded: true };
    }
  }

  return { rows: outRows, outputLimitExceeded: false };
}
