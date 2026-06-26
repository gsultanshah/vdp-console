import { ObjectId, type Db, type WithId } from 'mongodb';
import { runOcrPipeline, type OcrDataPayload, type OcrVoterRow } from '@/lib/ocr-pipeline';
import type { BlockCodeDocument, ProcessPageResult } from '@/lib/process-page';

export type ProcessDocumentMode = 'ocr_only' | 'full';

export interface ProcessDocumentOptions {
  mode?: ProcessDocumentMode;
  force?: boolean;
}

export interface ProcessDocumentResult {
  page: {
    id: string;
    blockCode: string;
    fileName: string;
    halkaName: string;
    tag?: string;
    status: string;
  };
  mode: ProcessDocumentMode;
  ocr_data: OcrDataPayload;
  voters?: ProcessPageResult;
}

export async function findBlockcodePage(
  db: Db,
  params: { pageId?: string | null; blockCode?: string | null; fileName?: string | null }
): Promise<WithId<BlockCodeDocument> | null> {
  if (params.pageId) {
    return db.collection<BlockCodeDocument>('blockcodes').findOne({
      _id: new ObjectId(params.pageId),
    });
  }

  if (params.blockCode && params.fileName) {
    return db.collection<BlockCodeDocument>('blockcodes').findOne({
      blockCode: params.blockCode,
      fileName: params.fileName,
    });
  }

  return null;
}

export async function saveOcrDataToBlockcode(
  db: Db,
  pageId: ObjectId,
  ocr_data: OcrDataPayload
): Promise<void> {
  await db.collection('blockcodes').updateOne(
    { _id: pageId },
    {
      $set: {
        ocr_data,
        ocrAt: new Date(ocr_data.ocrAt),
      },
    }
  );
}

export async function saveVotersFromFinalJson(
  document: BlockCodeDocument,
  finalJson: OcrVoterRow[],
  origin: string
): Promise<ProcessPageResult> {
  const result: ProcessPageResult = {
    saved: 0,
    errors: 0,
    skippedNoCnic: 0,
    duplicates: 0,
  };

  for (const voter of finalJson) {
    const voterPayload = {
      cnic: voter.cnic,
      halkaName: document.halkaName,
      blockCode: document.blockCode,
      silsilaNo: voter.silsila_no,
      gharanaNo: voter.gharana_no,
      name: voter.remaining_text,
      row: voter.row,
      rowY: 0,
      rowHeight: 40,
      imageUrl: document.url,
      gender: document.gender,
      religion: document.religion,
      pageTag: document.tag,
      fileName: document.fileName,
    };

    if (!voterPayload.cnic) {
      result.skippedNoCnic += 1;
      continue;
    }

    try {
      const saveResponse = await fetch(`${origin}/api/voters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(voterPayload),
      });

      const saveData = await saveResponse.json().catch(() => ({}));

      if (!saveResponse.ok) {
        result.errors += 1;
        continue;
      }

      if (saveData.message === 'Voter already exists') {
        result.duplicates += 1;
      } else {
        result.saved += 1;
      }
    } catch {
      result.errors += 1;
    }
  }

  return result;
}

export async function processBlockcodeDocument(
  db: Db,
  document: BlockCodeDocument,
  origin: string,
  options: ProcessDocumentOptions = {}
): Promise<ProcessDocumentResult> {
  const mode = options.mode ?? 'full';

  if (mode === 'full' && document.tag === 'title') {
    throw new Error('Title pages cannot be processed for voters');
  }

  const previousStatus = document.status;

  await db.collection('blockcodes').updateOne(
    { _id: document._id },
    { $set: { status: 'processing', processingStartedAt: new Date() } }
  );

  try {
    const { ocr_data, finalJson } = await runOcrPipeline(document.url);
    await saveOcrDataToBlockcode(db, document._id, ocr_data);

    if (mode === 'ocr_only') {
      const restoredStatus = previousStatus === 'processing' ? 'uploaded' : previousStatus;
      await db.collection('blockcodes').updateOne(
        { _id: document._id },
        { $set: { status: restoredStatus } }
      );

      return {
        page: {
          id: document._id.toString(),
          blockCode: document.blockCode,
          fileName: document.fileName,
          halkaName: document.halkaName,
          tag: document.tag,
          status: restoredStatus,
        },
        mode,
        ocr_data,
      };
    }

    const voters = await saveVotersFromFinalJson(document, finalJson, origin);

    await db.collection('blockcodes').updateOne(
      { _id: document._id },
      { $set: { status: 'completed', processedAt: new Date() } }
    );

    return {
      page: {
        id: document._id.toString(),
        blockCode: document.blockCode,
        fileName: document.fileName,
        halkaName: document.halkaName,
        tag: document.tag,
        status: 'completed',
      },
      mode,
      ocr_data,
      voters,
    };
  } catch (error) {
    await db.collection('blockcodes').updateOne(
      { _id: document._id },
      { $set: { status: 'error' } }
    );
    throw error;
  }
}
