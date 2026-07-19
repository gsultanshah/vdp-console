import { ObjectId, type Db } from 'mongodb';
import sharp from 'sharp';
import { appendCnicGenderFilter } from '@/lib/cnic';
import { buildCloudinaryRowCropUrl, CLOUDINARY_CROP_WIDTH } from '@/lib/cloudinary-url';
import { resolveCloudinaryPublicIdServer } from '@/lib/cloudinary-server';
import { formatCnicDisplay } from '@/lib/phone-data';
import {
  electoralRollBlockCodesForLookup,
  findPollingSchemeForVoter,
  normalizePollingSchemeHalka,
  normalizePollingType,
} from '@/lib/polling-scheme/blockcode-lookup';
import { getPollingStationOverride } from '@/lib/voter-parchi/polling-station-overrides';
import { resolveVoterDisplayName } from '@/lib/voter-parchi/voter-display-fields';
import { textPrefersLatin } from '@/lib/voter-parchi/parchi-fonts';
import type { ParchiVoterRecord, VoterParchiDesign } from '@/lib/voter-parchi/types';
import type { VoterReproductionData } from '@/lib/voter-document';

export const ROW_VERTICAL_PADDING_RATIO = 0.18;

function normalizeHalka(halkaName: string): string {
  return normalizePollingSchemeHalka(halkaName);
}

export function cleanPdfUrduText(value: string): string {
  return value
    .normalize('NFC')
    .replace(/\uFFFD/g, '')
    .replace(/[\uE000-\uF8FF]/g, '')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .replace(/[^\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u200C\u200D\s\dA-Za-z(),،.+\-/:;'"%&@#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Prefer cleaned PDF text but keep the original when cleaning would erase real content. */
export function displayPdfFieldText(value: string): string {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '—';
  const cleaned = cleanPdfUrduText(trimmed);
  return cleaned || trimmed;
}

const URDU_SCRIPT_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

/** PDFKit renders LTR only — reverse RTL word order so Urdu reads correctly. */
export function shouldReversePdfRtlWords(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed === '—') return false;
  if (/^[\d\s\-+().,/:%#]+$/.test(trimmed)) return false;
  if (textPrefersLatin(trimmed)) return false;
  return URDU_SCRIPT_RE.test(trimmed);
}

export function reversePdfRtlLine(line: string): string {
  const tokens = line.split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) return line;
  return tokens.reverse().join(' ');
}

/** Clean + RTL word-order fix for PDFKit text drawing. */
export function preparePdfDisplayText(text: string): string {
  const display = displayPdfFieldText(text).replace(/:+$/, '').trimEnd();
  if (!shouldReversePdfRtlWords(display)) return display;
  return display
    .split('\n')
    .map((line) => reversePdfRtlLine(line))
    .join('\n');
}

function isUsablePollingText(text: string): boolean {
  if (!text) return false;
  const letters = text.match(/[\u0600-\u06FFa-zA-Z]/g)?.length ?? 0;
  return letters >= 3;
}

function isGenericAreaLabel(text: string): boolean {
  const lower = text.toLowerCase().trim();
  const generic = [
    'village',
    'ward/mohalla/street',
    'ward',
    'mohalla',
    'street',
    'city',
    'town',
    'rural',
    'urban',
  ];
  return generic.includes(lower);
}

function extractPollingTextFromSourceRaw(
  raw: string,
  blockcode: unknown
): string {
  const cleaned = cleanPdfUrduText(raw);
  if (!cleaned) return '';

  let rest = cleaned.replace(/^\d+\s+/, '');
  const blockDigits = String(blockcode ?? '').replace(/\D/g, '');
  const blockVariants = new Set<string>();
  if (blockDigits) {
    blockVariants.add(blockDigits);
    const canonical = String(Number.parseInt(blockDigits, 10));
    if (canonical && canonical !== 'NaN') {
      blockVariants.add(canonical);
      blockVariants.add(canonical.padStart(7, '0'));
    }
  }

  for (const variant of Array.from(blockVariants)) {
    const idx = rest.indexOf(variant);
    if (idx > 0) {
      rest = rest.slice(0, idx).trim();
      break;
    }
  }

  rest = rest.replace(/\s+[\d\-]+\s+[\d\-]+(?:\s+[\d\-]+)*\s*$/, '').trim();
  return rest;
}

function pollingBoothLabel(doc: Record<string, unknown>): string {
  const type = String(doc.type ?? '').toLowerCase();
  if (type === 'female') return String(doc.female_booth ?? '').trim();
  if (type === 'male') return String(doc.male_booth ?? '').trim();
  return String(doc.total_booth ?? doc.male_booth ?? doc.female_booth ?? '').trim();
}

/** شماریاتی کوڈ is the electoral-roll block code only (not block+silsila). */
function buildStatisticalCode(blockCode: string, _silsilaNo?: string): string {
  const raw = String(blockCode ?? '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (!digits) return raw;
  // Preserve common 7-digit padded form used on electoral rolls (e.g. 0070003).
  if (digits.length <= 7) return digits.padStart(7, '0');
  return digits;
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

function formatPollingStationDisplay(doc: Record<string, unknown>): string {
  let station = cleanPdfUrduText(String(doc.polling_station_name ?? ''));

  if (!isUsablePollingText(station)) {
    station = extractPollingTextFromSourceRaw(String(doc.sourceRawText ?? ''), doc.blockcode);
    station = cleanPdfUrduText(station);
  }

  if (!isUsablePollingText(station)) {
    const area = cleanPdfUrduText(String(doc.area ?? ''));
    if (isUsablePollingText(area) && !isGenericAreaLabel(area)) {
      station = area;
    }
  }

  if (!isUsablePollingText(station)) {
    return '';
  }

  const latinLetters = (station.match(/[A-Za-z]/g) ?? []).length;
  const arabicLetters =
    (station.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g) ?? []).length;
  const preferLatin = latinLetters >= arabicLetters && latinLetters > 0;

  const type = String(doc.type ?? '').toLowerCase();
  if (
    type === 'combined' &&
    !station.includes('مشترکہ') &&
    !station.toLowerCase().includes('joint') &&
    !station.toLowerCase().includes('combined')
  ) {
    station = preferLatin ? `${station} (Combined)` : `${station} (مشترکہ)`;
  }

  const booth = pollingBoothLabel(doc);
  if (booth) {
    // Keep suffix in the same script as the station so PDFKit can use one font.
    station = preferLatin ? `${station} (Booth ${booth})` : `${station} (بوتھ ${booth})`;
  }

  return station;
}

async function lookupPollingStation(
  db: Db,
  halkaName: string,
  blockCode: string,
  silsilaNo: string,
  gender: string,
  cnic: string
): Promise<string> {
  const doc = await findPollingSchemeForVoter(db, {
    halkaName,
    blockCode,
    silsilaNo,
    gender,
    cnic,
  });
  if (!doc) {
    return getPollingStationOverride(db, halkaName, blockCode);
  }
  return formatPollingStationDisplay(doc);
}

function pollingLookupCacheKey(
  halkaName: string,
  blockCode: string,
  silsilaNo: string,
  gender: string,
  cnic: string
): string {
  const pollingType = normalizePollingType(gender, cnic);
  const blockKey = electoralRollBlockCodesForLookup(blockCode, silsilaNo)
    .map((value) => String(value))
    .join('|');
  return `${normalizeHalka(halkaName)}:${blockKey}:${pollingType}`;
}

export function mapVoterDocToParchiRecord(
  doc: Record<string, unknown>,
  pollingStation = '',
  rowCrop: { url: string; cropHeight: number } | null = null
): ParchiVoterRecord {
  const blockCode = String(doc.blockCode ?? doc.blockcode ?? '');
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
  docs: Record<string, unknown>[],
  options?: { skipRowCrops?: boolean; pollingStationOverride?: string | null }
): Promise<ParchiVoterRecord[]> {
  const normalizedHalka = normalizeHalka(halkaName);
  const pollingCache = new Map<string, string>();
  const publicIdCache = new Map<string, string>();
  const results: ParchiVoterRecord[] = [];
  const skipRowCrops = Boolean(options?.skipRowCrops);
  const pollingStationOverride = cleanPdfUrduText(String(options?.pollingStationOverride ?? '').trim());

  for (const doc of docs) {
    const blockCode = String(doc.blockCode ?? doc.blockcode ?? '');
    const silsilaNo = String(doc.silsilaNo ?? '');
    const cnic = String(doc.cnic ?? '');
    const gender = String(doc.gender ?? '');

    let pollingStation = '';
    if (pollingStationOverride) {
      pollingStation = pollingStationOverride;
    } else {
      const halkaCandidates = Array.from(
        new Set(
          [String(doc.halkaName ?? ''), halkaName, normalizedHalka]
            .map((value) => normalizeHalka(value))
            .filter(Boolean)
        )
      );

      for (const halkaCandidate of halkaCandidates) {
        const cacheKey = pollingLookupCacheKey(halkaCandidate, blockCode, silsilaNo, gender, cnic);
        const cached = pollingCache.get(cacheKey);
        if (cached !== undefined) {
          pollingStation = cached;
          break;
        }

        pollingStation = await lookupPollingStation(
          db,
          halkaCandidate,
          blockCode,
          silsilaNo,
          gender,
          cnic
        );
        pollingCache.set(cacheKey, pollingStation);
        if (pollingStation) break;
      }
    }

    let rowCrop: { url: string; cropHeight: number } | null = null;
    if (!skipRowCrops) {
      const reproduction = parseReproduction(doc);
      const band = rowBandFromDoc(doc, reproduction);
      rowCrop = band
        ? await resolveRowCropUrl(
            String(doc.imageUrl ?? ''),
            band.y,
            band.height,
            reproduction,
            publicIdCache
          )
        : null;
    }

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
      return resolveVoterDisplayName(voter);
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
      return voter.statisticalCode || buildStatisticalCode(voter.blockCode, voter.silsilaNo);
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

export async function fetchImageBuffer(
  url: string | null | undefined,
  timeoutMs = 12_000
): Promise<Buffer | null> {
  if (!url) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
      redirect: 'follow',
      headers: {
        Accept: 'image/*',
        'User-Agent': 'vdp-console-parchi/1.0',
      },
    });
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchServerSideRowCrop(
  imageUrl: string,
  cropY: number,
  cropHeight: number
): Promise<Buffer | null> {
  try {
    const source = await fetchImageBuffer(imageUrl, 20_000);
    if (!source) return null;

    const meta = await sharp(source).metadata();
    const width = meta.width ?? CLOUDINARY_CROP_WIDTH;
    const pageHeight = meta.height ?? 0;
    if (pageHeight <= 0 || cropY >= pageHeight) return null;

    const top = Math.max(0, Math.round(cropY));
    const height = Math.min(Math.round(cropHeight), pageHeight - top);
    if (height <= 0) return null;

    return await sharp(source)
      .extract({
        left: 0,
        top,
        width,
        height,
      })
      .jpeg({ quality: 88 })
      .toBuffer();
  } catch (error) {
    console.warn('Server-side row crop failed:', error);
    return null;
  }
}

/** Fetch electoral-roll row scan for PDF/canvas rendering (Cloudinary URL + sharp fallback). */
export async function fetchRowCropImageBuffer(voter: ParchiVoterRecord): Promise<Buffer | null> {
  if (voter.rowCropUrl) {
    const fromCloudinary = await fetchImageBuffer(voter.rowCropUrl, 20_000);
    if (fromCloudinary) return fromCloudinary;
  }

  const imageUrl = voter.imageUrl?.trim();
  const rowHeight = voter.rowHeight;
  if (!imageUrl || !rowHeight || rowHeight <= 0) return null;

  const padding = Math.round(rowHeight * ROW_VERTICAL_PADDING_RATIO);
  const cropY = Math.max(0, Math.round(voter.rowY - padding));
  const cropHeight = Math.round(rowHeight + padding * 2);
  return fetchServerSideRowCrop(imageUrl, cropY, cropHeight);
}

export function voterFilterQuery(
  halkaName: string,
  blockCodes: string[],
  selectAllBlockCodes: boolean,
  genderFilter: 'both' | 'male' | 'female'
): Record<string, unknown> {
  const normalized = normalizeHalka(halkaName);
  const trimmed = halkaName.trim();
  const filter: Record<string, unknown> =
    normalized === trimmed ? { halkaName: normalized } : { halkaName: { $in: [normalized, trimmed] } };
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
  // Use CNIC last-digit gender (same as constituency male/female counts), not document.gender.
  appendCnicGenderFilter(filter, genderFilter);
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

export const PARCHI_VOTER_PROJECTION = {
  _id: 1,
  cnic: 1,
  name: 1,
  fatherName: 1,
  age: 1,
  address: 1,
  previousAddress: 1,
  blockCode: 1,
  silsilaNo: 1,
  gharanaNo: 1,
  gender: 1,
  profession: 1,
  religion: 1,
  imageUrl: 1,
  rowY: 1,
  rowHeight: 1,
  reproduction: 1,
  halkaName: 1,
} as const;

/**
 * Numeric silsila for stable PDF order: 1, 2, 3… (not lexicographic "1","10","2").
 * Extracts the first run of digits from silsilaNo.
 */
export function silsilaNumericExpression(fieldPath = '$silsilaNo'): Record<string, unknown> {
  return {
    $let: {
      vars: {
        raw: {
          $trim: {
            input: { $toString: { $ifNull: [fieldPath, ''] } },
          },
        },
      },
      in: {
        $convert: {
          input: {
            $ifNull: [
              {
                $getField: {
                  field: 'match',
                  input: {
                    $regexFind: {
                      input: '$$raw',
                      regex: '[0-9]+',
                    },
                  },
                },
              },
              '0',
            ],
          },
          to: 'long',
          onError: 0,
          onNull: 0,
        },
      },
    },
  };
}

/** Sort key used by all parchi PDF generation paths (web, CLI, preview). */
export const PARCHI_VOTER_SORT = {
  blockCode: 1 as const,
  _silsilaSort: 1 as const,
  _id: 1 as const,
};

/**
 * Fetch a batch of voters for parchi PDF generation, ordered by block then silsila (1,2,3…).
 * Uses skip for resume so order stays consistent across batches.
 */
export async function fetchParchiVoterDocsBatch(
  db: Db,
  filter: Record<string, unknown>,
  options: { skip?: number; limit: number }
): Promise<Record<string, unknown>[]> {
  const skip = Math.max(0, options.skip ?? 0);
  const limit = Math.max(1, options.limit);

  const docs = await db
    .collection('voters')
    .aggregate(
      [
        { $match: filter },
        { $addFields: { _silsilaSort: silsilaNumericExpression('$silsilaNo') } },
        { $sort: PARCHI_VOTER_SORT },
        ...(skip > 0 ? [{ $skip: skip }] : []),
        { $limit: limit },
        { $project: { ...PARCHI_VOTER_PROJECTION } },
      ],
      { allowDiskUse: true }
    )
    .toArray();

  return docs as Record<string, unknown>[];
}

/** In-memory reorder (safety net if callers already have a batch). */
export function sortParchiVotersBySilsila<T extends { silsilaNo?: string; blockCode?: string; _id?: string }>(
  voters: T[]
): T[] {
  const silsilaNum = (value: string | undefined) => {
    const match = String(value ?? '').match(/\d+/);
    return match ? Number.parseInt(match[0], 10) : 0;
  };
  return [...voters].sort((a, b) => {
    const blockCmp = String(a.blockCode ?? '').localeCompare(String(b.blockCode ?? ''), undefined, {
      numeric: true,
    });
    if (blockCmp !== 0) return blockCmp;
    const silsilaCmp = silsilaNum(a.silsilaNo) - silsilaNum(b.silsilaNo);
    if (silsilaCmp !== 0) return silsilaCmp;
    return String(a._id ?? '').localeCompare(String(b._id ?? ''));
  });
}

/** Fetch real voters from a block for designer / preview PDFs. */
export async function fetchParchiPreviewVoters(
  db: Db,
  halkaName: string,
  blockCode: string,
  limit: number,
  options?: { skipRowCrops?: boolean }
): Promise<ParchiVoterRecord[]> {
  const trimmed = String(blockCode).trim();
  if (!trimmed) return [];

  const filter = voterFilterQuery(halkaName, [trimmed], false, 'both');
  const voterDocs = await fetchParchiVoterDocsBatch(db, filter, {
    limit: Math.max(1, Math.min(5, limit)),
  });

  if (voterDocs.length === 0) return [];

  return enrichVotersWithPolling(db, halkaName, voterDocs, {
    skipRowCrops: options?.skipRowCrops,
  });
}
