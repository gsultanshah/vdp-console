import { ObjectId, type Db } from 'mongodb';
import { buildCloudinaryRowCropUrl, publicIdFromCloudinaryUrl } from '@/lib/cloudinary-url';
import { formatCnicDisplay } from '@/lib/phone-data';
import { formatGenderFromCnic } from '@/lib/cnic';
import type { ParchiVoterRecord, VoterParchiDesign } from '@/lib/voter-parchi/types';

function buildStatisticalCode(blockCode: string, silsilaNo: string): string {
  const block = String(blockCode ?? '').replace(/\D/g, '');
  const silsila = String(silsilaNo ?? '').replace(/\D/g, '');
  if (block && silsila) return `${block}${silsila.padStart(3, '0')}`;
  return block || silsila || '';
}

function buildRowCropUrl(imageUrl: string, rowY: number, rowHeight: number): string | null {
  if (!imageUrl || !rowY || !rowHeight) return null;
  const publicId = publicIdFromCloudinaryUrl(imageUrl);
  if (publicId) {
    return buildCloudinaryRowCropUrl(publicId, rowY, rowHeight);
  }
  return imageUrl;
}

async function lookupPollingStation(
  db: Db,
  halkaName: string,
  blockCode: string,
  gender: string
): Promise<string> {
  const code = Number.parseInt(String(blockCode).replace(/\D/g, ''), 10);
  if (!Number.isFinite(code) || code <= 0) return '';

  const stationType =
    gender === 'male' || gender === 'female' ? gender : gender.toLowerCase().includes('female') ? 'female' : 'male';

  const doc = await db.collection('polling_scheme').findOne({
    halkaName,
    blockcode: code,
    type: stationType,
  });

  if (!doc) {
    const fallback = await db.collection('polling_scheme').findOne({
      halkaName,
      blockcode: code,
    });
    if (fallback) {
      return String(fallback.polling_station_name ?? fallback.area ?? '');
    }
    return '';
  }

  return String(doc.polling_station_name ?? doc.area ?? '');
}

export function mapVoterDocToParchiRecord(
  doc: Record<string, unknown>,
  pollingStation = ''
): ParchiVoterRecord {
  const blockCode = String(doc.blockCode ?? '');
  const silsilaNo = String(doc.silsilaNo ?? '');
  const gender = String(doc.gender ?? formatGenderFromCnic(String(doc.cnic ?? '')) ?? '');
  const imageUrl = String(doc.imageUrl ?? '');
  const rowY = Number(doc.rowY) || 0;
  const rowHeight = Number(doc.rowHeight) || 0;

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
    pollingStation,
    statisticalCode: buildStatisticalCode(blockCode, silsilaNo),
    rowCropUrl: buildRowCropUrl(imageUrl, rowY, rowHeight),
  };
}

export async function enrichVotersWithPolling(
  db: Db,
  halkaName: string,
  docs: Record<string, unknown>[]
): Promise<ParchiVoterRecord[]> {
  const pollingCache = new Map<string, string>();
  const results: ParchiVoterRecord[] = [];

  for (const doc of docs) {
    const blockCode = String(doc.blockCode ?? '');
    const gender = String(doc.gender ?? formatGenderFromCnic(String(doc.cnic ?? '')) ?? '');
    const cacheKey = `${blockCode}:${gender}`;
    let pollingStation = pollingCache.get(cacheKey);
    if (pollingStation === undefined) {
      pollingStation = await lookupPollingStation(db, halkaName, blockCode, gender);
      pollingCache.set(cacheKey, pollingStation);
    }
    results.push(mapVoterDocToParchiRecord(doc, pollingStation));
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
    filter.blockCode = { $in: blockCodes };
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
