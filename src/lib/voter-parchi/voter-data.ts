import { ObjectId, type Db } from 'mongodb';
import { buildCloudinaryRowCropUrl } from '@/lib/cloudinary-url';
import { resolveCloudinaryPublicIdServer } from '@/lib/cloudinary-server';
import { formatCnicDisplay } from '@/lib/phone-data';
import { genderFromCnic } from '@/lib/cnic';
import type { ParchiVoterRecord, VoterParchiDesign } from '@/lib/voter-parchi/types';
import type { VoterReproductionData } from '@/lib/voter-document';

export const ROW_VERTICAL_PADDING_RATIO = 0.18;

function normalizeHalka(halkaName: string): string {
  return halkaName.replace(/\s+/g, '').toUpperCase();
}

export function cleanPdfUrduText(value: string): string {
  return value
    .normalize('NFC')
    .replace(/\uFFFD/g, '')
    .replace(/[\uE000-\uF8FF]/g, '')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .replace(/[^\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u200C\u200D\s\dA-Za-z(),،.+-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isUsablePollingText(text: string): boolean {
  if (!text) return false;
  const letters = text.match(/[\u0600-\u06FFa-zA-Z]/g)?.length ?? 0;
  return letters >= 3;
}

function buildStatisticalCode(blockCode: string, silsilaNo: string): string {
  const block = String(blockCode ?? '').replace(/\D/g, '');
  const silsila = String(silsilaNo ?? '').replace(/\D/g, '');
  if (block && silsila) return `${block}${silsila.padStart(3, '0')}`;
  return block || silsila || '';
}

function parseReproduction(doc: Record<string, unknown>): VoterReproductionData | null {
  const reproduction = doc.reproduction;
  if (!reproduction || typeof reproduction !== 'object') return null;
  return reproduction as VoterReproductionData;
}

function rowBandFromDoc(
  doc: Record<string, unknown>,
  reproduction: VoterReproductionData | null
): { y: number; height: number } | null {
  const bandY = reproduction?.band?.y ?? Number(doc.rowY);
  const bandHeight = reproduction?.band?.height ?? Number(doc.rowHeight);
  if (!Number.isFinite(bandY) || !Number.isFinite(bandHeight) || bandHeight <= 0) {
    return null;
  }
  return { y: bandY, height: bandHeight };
}

export async function resolveRowCropUrl(
  imageUrl: string,
  rowY: number,
  rowHeight: number,
  reproduction?: VoterReproductionData | null,
  publicIdCache?: Map<string, string>
): Promise<{ url: string; cropHeight: number } | null> {
  const trimmedUrl = imageUrl?.trim();
  if (!trimmedUrl) return null;

  const bandY = reproduction?.band?.y ?? rowY;
  const bandHeight = reproduction?.band?.height ?? rowHeight;
  if (!Number.isFinite(bandHeight) || bandHeight <= 0) return null;

  const padding = Math.round(bandHeight * ROW_VERTICAL_PADDING_RATIO);
  const cropY = Math.max(0, Math.round(bandY - padding));
  const cropHeight = Math.round(bandHeight + padding * 2);

  try {
    let publicId = publicIdCache?.get(trimmedUrl);
    if (!publicId) {
      publicId = await resolveCloudinaryPublicIdServer(trimmedUrl);
      publicIdCache?.set(trimmedUrl, publicId);
    }
    return {
      url: buildCloudinaryRowCropUrl(publicId, cropY, cropHeight),
      cropHeight,
    };
  } catch (error) {
    console.warn('Row crop Cloudinary resolve failed:', error);
    return null;
  }
}

function blockcodeLookupCandidates(blockCode: string, silsilaNo: string): Array<number | string> {
  const candidates = new Set<number | string>();
  const digits = String(blockCode ?? '').replace(/\D/g, '');
  const silsilaDigits = String(silsilaNo ?? '').replace(/\D/g, '');
  const statistical = buildStatisticalCode(blockCode, silsilaNo);

  const add = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    candidates.add(trimmed);
    const numeric = Number.parseInt(trimmed.replace(/\D/g, ''), 10);
    if (Number.isFinite(numeric) && numeric > 0) {
      candidates.add(numeric);
    }
  };

  if (digits) {
    add(digits);
    add(digits.replace(/^0+/, '') || digits);
    add(digits.padStart(7, '0'));
    if (silsilaDigits) {
      const paddedSilsila = silsilaDigits.padStart(3, '0');
      if (digits.endsWith(paddedSilsila) && digits.length > paddedSilsila.length) {
        add(digits.slice(0, digits.length - paddedSilsila.length));
      }
    }
    if (digits.length > 3) {
      add(digits.slice(0, -3));
    }
  }

  add(statistical);

  return Array.from(candidates);
}

function normalizePollingType(gender: string, cnic: string): 'male' | 'female' {
  const fromCnic = genderFromCnic(cnic);
  if (fromCnic) return fromCnic;

  const lower = gender.toLowerCase();
  if (lower.includes('female') || lower.includes('خواتین') || lower.includes('عورت')) {
    return 'female';
  }
  return 'male';
}

function formatPollingStationDisplay(doc: Record<string, unknown>): string {
  const candidates = [
    doc.polling_station_name,
    doc.area,
    doc.sourceRawText,
  ];

  for (const candidate of candidates) {
    const cleaned = cleanPdfUrduText(String(candidate ?? ''));
    if (isUsablePollingText(cleaned)) {
      const type = String(doc.type ?? '').toLowerCase();
      if (
        type === 'combined' &&
        !cleaned.includes('مشترکہ') &&
        !cleaned.toLowerCase().includes('joint')
      ) {
        return `${cleaned} (مشترکہ)`;
      }
      return cleaned;
    }
  }

  return '';
}

async function findPollingDoc(
  db: Db,
  halkaName: string,
  codes: Array<number | string>,
  type?: 'male' | 'female' | 'combined'
): Promise<Record<string, unknown> | null> {
  const normalizedHalka = normalizeHalka(halkaName);
  const halkaValues = Array.from(new Set([normalizedHalka, halkaName.trim()].filter(Boolean)));

  const filter: Record<string, unknown> = {
    halkaName: halkaValues.length === 1 ? halkaValues[0] : { $in: halkaValues },
    blockcode: { $in: codes },
  };
  if (type) {
    filter.type = type;
  }

  const doc = await db.collection('polling_scheme').findOne(filter);
  return doc ? (doc as Record<string, unknown>) : null;
}

async function lookupPollingStation(
  db: Db,
  halkaName: string,
  blockCode: string,
  silsilaNo: string,
  gender: string,
  cnic: string
): Promise<string> {
  const pollingType = normalizePollingType(gender, cnic);
  const codes = blockcodeLookupCandidates(blockCode, silsilaNo);
  if (codes.length === 0) return '';

  const typesToTry: Array<'male' | 'female' | 'combined'> = [pollingType, 'combined'];

  for (const type of typesToTry) {
    const doc = await findPollingDoc(db, halkaName, codes, type);
    if (doc) {
      const text = formatPollingStationDisplay(doc);
      if (text) return text;
    }
  }

  const doc = await findPollingDoc(db, halkaName, codes);
  if (doc) {
    return formatPollingStationDisplay(doc);
  }

  return '';
}

export function mapVoterDocToParchiRecord(
  doc: Record<string, unknown>,
  pollingStation = '',
  rowCrop: { url: string; cropHeight: number } | null = null
): ParchiVoterRecord {
  const blockCode = String(doc.blockCode ?? '');
  const silsilaNo = String(doc.silsilaNo ?? '');
  const gender = String(doc.gender ?? '');
  const imageUrl = String(doc.imageUrl ?? '');
  const reproduction = parseReproduction(doc);
  const band = rowBandFromDoc(doc, reproduction);
  const rowY = band?.y ?? (Number(doc.rowY) || 0);
  const rowHeight = band?.height ?? (Number(doc.rowHeight) || 0);

  return {
    _id: String(doc._id),
    cnic: formatCnicDisplay(String(doc.cnic ?? '')),
    name: String(doc.name ?? ''),
    fatherName: String(doc.fatherName ?? ''),
    age: String(doc.age ?? ''),
    address: String(doc.address ?? ''),
    previousAddress: String(doc.previousAddress ?? ''),
    blockCode,
    silsilaNo,
    gharanaNo: String(doc.gharanaNo ?? ''),
    gender,
    profession: String(doc.profession ?? ''),
    religion: String(doc.religion ?? ''),
    imageUrl,
    rowY,
    rowHeight,
    pollingStation: cleanPdfUrduText(pollingStation),
    statisticalCode: buildStatisticalCode(blockCode, silsilaNo),
    rowCropUrl: rowCrop?.url ?? null,
    rowCropHeight: rowCrop?.cropHeight ?? 0,
  };
}

export async function enrichVotersWithPolling(
  db: Db,
  halkaName: string,
  docs: Record<string, unknown>[]
): Promise<ParchiVoterRecord[]> {
  const normalizedHalka = normalizeHalka(halkaName);
  const pollingCache = new Map<string, string>();
  const publicIdCache = new Map<string, string>();
  const results: ParchiVoterRecord[] = [];

  for (const doc of docs) {
    const blockCode = String(doc.blockCode ?? '');
    const silsilaNo = String(doc.silsilaNo ?? '');
    const cnic = String(doc.cnic ?? '');
    const gender = String(doc.gender ?? '');
    const pollingType = normalizePollingType(gender, cnic);
    const cacheKey = `${blockCode}:${silsilaNo}:${pollingType}`;
    let pollingStation = pollingCache.get(cacheKey);
    if (pollingStation === undefined) {
      pollingStation = await lookupPollingStation(db, normalizedHalka, blockCode, silsilaNo, gender, cnic);
      if (!pollingStation && doc.halkaName) {
        pollingStation = await lookupPollingStation(
          db,
          normalizeHalka(String(doc.halkaName)),
          blockCode,
          silsilaNo,
          gender,
          cnic
        );
      }
      pollingCache.set(cacheKey, pollingStation);
    }

    const reproduction = parseReproduction(doc);
    const band = rowBandFromDoc(doc, reproduction);
    const rowCrop = band
      ? await resolveRowCropUrl(
          String(doc.imageUrl ?? ''),
          band.y,
          band.height,
          reproduction,
          publicIdCache
        )
      : null;

    results.push(mapVoterDocToParchiRecord(doc, pollingStation, rowCrop));
  }

  return results;
}

export function resolveFieldValue(
  fieldId: string,
  voter: ParchiVoterRecord,
  design: VoterParchiDesign
): string {
  switch (fieldId) {
    case 'rowCrop':
      return '';
    case 'name':
      return voter.name;
    case 'cnic':
      return voter.cnic;
    case 'fatherName':
      return voter.fatherName;
    case 'age':
      return voter.age ? `${voter.age} سال` : '';
    case 'address':
      return voter.address;
    case 'previousAddress':
      return voter.previousAddress;
    case 'blockCode':
      return voter.blockCode;
    case 'silsilaNo':
      return voter.silsilaNo;
    case 'gharanaNo':
      return voter.gharanaNo;
    case 'gender':
      return voter.gender;
    case 'profession':
      return voter.profession;
    case 'religion':
      return voter.religion;
    case 'pollingStation':
      return voter.pollingStation;
    case 'statisticalCode':
      return voter.statisticalCode;
    case 'customText':
      return design.customHeaderText ?? '';
    default:
      return '';
  }
}

export function resolveAssetUrl(design: VoterParchiDesign, fieldId: string): string | null {
  if (fieldId === 'symbol' && design.symbolAssetId) {
    return design.assets.find((a) => a.id === design.symbolAssetId)?.url ?? null;
  }
  if (fieldId === 'photo' && design.photoAssetId) {
    return design.assets.find((a) => a.id === design.photoAssetId)?.url ?? null;
  }
  if (design.headerAssetId) {
    return design.assets.find((a) => a.id === design.headerAssetId)?.url ?? null;
  }
  return null;
}

export async function fetchImageBuffer(url: string | null | undefined): Promise<Buffer | null> {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

export function voterFilterQuery(
  halkaName: string,
  blockCodes: string[],
  selectAllBlockCodes: boolean,
  genderFilter: 'both' | 'male' | 'female'
): Record<string, unknown> {
  const filter: Record<string, unknown> = { halkaName };
  if (!selectAllBlockCodes && blockCodes.length > 0) {
    const codes = Array.from(new Set(blockCodes.map((c) => String(c).trim()).filter(Boolean)));
    // Match both padded and unpadded string forms used in voter docs.
    const variants = new Set<string>();
    for (const code of codes) {
      variants.add(code);
      const digits = code.replace(/\D/g, '');
      if (digits) {
        variants.add(digits);
        variants.add(digits.padStart(7, '0'));
      }
    }
    filter.blockCode = { $in: Array.from(variants) };
  }
  if (genderFilter === 'male') {
    filter.$or = [{ gender: 'male' }, { gender: { $exists: false } }];
  } else if (genderFilter === 'female') {
    filter.gender = 'female';
  }
  return filter;
}

export function parseObjectIdCursor(lastVoterId: string | null): ObjectId | null {
  if (!lastVoterId) return null;
  try {
    return new ObjectId(lastVoterId);
  } catch {
    return null;
  }
}
