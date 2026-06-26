import type { Db, WithId } from 'mongodb';
import { getVoterTableFromOcrData } from '@/lib/ocr-processing';
import type { OcrDataPayload, OcrRowElement } from '@/lib/ocr-types';
import type { OcrCropRect, OcrVoterTableMeta, OcrVoterTableRow } from '@/lib/voter-table-extraction';
import type { BlockCodeDocument } from '@/lib/process-page';

export interface VoterReproductionData {
  pageId: string;
  ocrAt: string;
  skewAngle: number;
  cropParams: string;
  band: OcrCropRect;
  cnicBox: OcrCropRect;
  elements: OcrRowElement[];
  pageWidth: number;
  pageHeight: number;
  voterTableMeta?: OcrVoterTableMeta;
}

export interface VoterDocumentPayload {
  cnic: string;
  halkaName: string;
  blockCode: string;
  silsilaNo: string;
  gharanaNo: string;
  name: string;
  row: number;
  rowY: number;
  rowHeight: number;
  imageUrl: string;
  gender?: string;
  religion?: string;
  pageTag?: string;
  fileName: string;
  fatherName?: string;
  profession?: string;
  age?: string;
  address?: string;
  reproduction: VoterReproductionData;
}

function getPageDimensions(ocrData: OcrDataPayload): { width: number; height: number } {
  const vision = ocrData.vision as {
    fullTextAnnotation?: { pages?: { width?: number; height?: number }[] };
  };
  const page = vision.fullTextAnnotation?.pages?.[0];
  return {
    width: page?.width ?? 2480,
    height: page?.height ?? 3505,
  };
}

export function findVoterTableRowByCnic(
  ocrData: OcrDataPayload,
  cnic: string
): OcrVoterTableRow | null {
  const { rows } = getVoterTableFromOcrData(ocrData);
  return rows.find((row) => row.cnic === cnic) ?? null;
}

export async function findBlockcodePageByCnic(
  db: Db,
  cnic: string
): Promise<WithId<BlockCodeDocument> | null> {
  return db.collection<BlockCodeDocument>('blockcodes').findOne({
    $or: [{ 'ocr_data.voterTableRows.cnic': cnic }, { 'ocr_data.finalJson.cnic': cnic }],
  });
}

export function buildVoterDocumentFromTableRow(
  document: BlockCodeDocument,
  ocrData: OcrDataPayload,
  tableRow: OcrVoterTableRow
): VoterDocumentPayload {
  const pageId = document._id.toString();
  const { width: pageWidth, height: pageHeight } = getPageDimensions(ocrData);
  const { meta: voterTableMeta } = getVoterTableFromOcrData(ocrData);

  const name = [tableRow.name, tableRow.father_name, tableRow.profession, tableRow.age, tableRow.address]
    .filter(Boolean)
    .join(' ');

  return {
    cnic: tableRow.cnic,
    halkaName: document.halkaName,
    blockCode: document.blockCode,
    silsilaNo: tableRow.silsila_no,
    gharanaNo: tableRow.name || tableRow.father_name,
    name,
    row: tableRow.rowIndex,
    rowY: Math.round(tableRow.band.y),
    rowHeight: Math.round(tableRow.band.height),
    imageUrl: document.url,
    gender: document.gender,
    religion: document.religion,
    pageTag: document.tag,
    fileName: document.fileName,
    fatherName: tableRow.father_name || undefined,
    profession: tableRow.profession || undefined,
    age: tableRow.age || undefined,
    address: tableRow.address || undefined,
    reproduction: {
      pageId,
      ocrAt: ocrData.ocrAt,
      skewAngle: ocrData.skewAngle,
      cropParams: tableRow.cropParams,
      band: tableRow.band,
      cnicBox: tableRow.cnicBox,
      elements: tableRow.elements,
      pageWidth,
      pageHeight,
      voterTableMeta,
    },
  };
}

export interface UpsertVoterResult {
  cnic: string;
  upserted: boolean;
  modified: boolean;
}

export async function upsertVoterByCnic(
  db: Db,
  voter: VoterDocumentPayload
): Promise<UpsertVoterResult> {
  const now = new Date();
  const result = await db.collection('voters').updateOne(
    { cnic: voter.cnic },
    {
      $set: {
        ...voter,
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    { upsert: true }
  );

  return {
    cnic: voter.cnic,
    upserted: Boolean(result.upsertedId),
    modified: result.modifiedCount > 0,
  };
}

export async function saveVoterFromBlockcodeByCnic(
  db: Db,
  document: WithId<BlockCodeDocument>,
  cnic: string
): Promise<UpsertVoterResult> {
  if (!document.ocr_data) {
    throw new Error(`Page ${document.blockCode}/${document.fileName} has no ocr_data. Run OCR first.`);
  }

  const tableRow = findVoterTableRowByCnic(document.ocr_data, cnic);
  if (!tableRow) {
    throw new Error(`CNIC ${cnic} not found in OCR data for page ${document.blockCode}/${document.fileName}`);
  }

  const voter = buildVoterDocumentFromTableRow(document, document.ocr_data, tableRow);
  return upsertVoterByCnic(db, voter);
}

export async function saveAllVotersFromBlockcode(
  db: Db,
  document: WithId<BlockCodeDocument>
): Promise<UpsertVoterResult[]> {
  if (!document.ocr_data) {
    throw new Error(`Page ${document.blockCode}/${document.fileName} has no ocr_data. Run OCR first.`);
  }

  const { rows } = getVoterTableFromOcrData(document.ocr_data);
  if (!rows.length) {
    throw new Error(`No voter rows found in OCR data for page ${document.blockCode}/${document.fileName}`);
  }

  const results: UpsertVoterResult[] = [];
  for (const tableRow of rows) {
    if (!tableRow.cnic) {
      continue;
    }
    const voter = buildVoterDocumentFromTableRow(document, document.ocr_data, tableRow);
    results.push(await upsertVoterByCnic(db, voter));
  }

  return results;
}
