import { ObjectId, type Db, type WithId } from 'mongodb';
import { runOcrPipeline, type OcrDataPayload } from '@/lib/ocr-pipeline';
import {
  enrichExistingVotersFromOcrData,
  persistedEnrichStats,
  saveNewVotersFromOcrData,
  type VoterEnrichPageResult,
} from '@/lib/voter-document';
import type { BlockCodeDocument, ProcessPageResult } from '@/lib/process-page';

export type BlockCodeDocumentWithOcr = BlockCodeDocument & { ocr_data?: OcrDataPayload | null };

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
  enrich?: VoterEnrichPageResult;
  ocr_skipped?: boolean;
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

/**
 * Run OCR and save ocr_data for a page already claimed by the OCR batch queue.
 * Restores the status captured in ocrClaimFromStatus (or uploaded when unknown).
 */
export async function processOcrForClaimedPage(
  db: Db,
  document: BlockCodeDocument & { ocrClaimFromStatus?: string }
): Promise<OcrDataPayload> {
  const restoreStatus =
    document.ocrClaimFromStatus && document.ocrClaimFromStatus !== 'processing'
      ? document.ocrClaimFromStatus
      : 'uploaded';

  try {
    const { ocr_data } = await runOcrPipeline(document.url);
    await saveOcrDataToBlockcode(db, document._id, ocr_data);

    await saveNewVotersFromOcrData(db, document, ocr_data);

    await db.collection('blockcodes').updateOne(
      { _id: document._id },
      {
        $set: { status: restoreStatus },
        $unset: { ocrClaimFromStatus: '' },
      }
    );

    return ocr_data;
  } catch (error) {
    await db.collection('blockcodes').updateOne(
      { _id: document._id },
      {
        $set: { status: 'error' },
        $unset: { ocrClaimFromStatus: '' },
      }
    );
    throw error;
  }
}

export async function processBlockcodeDocument(
  db: Db,
  document: BlockCodeDocument,
  _originOrDb: string | Db,
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
    const { ocr_data } = await runOcrPipeline(document.url);
    await saveOcrDataToBlockcode(db, document._id, ocr_data);

    const voters = await saveNewVotersFromOcrData(db, document, ocr_data);

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
        voters,
      };
    }

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

export interface ProcessAndEnrichResult {
  page: ProcessDocumentResult['page'];
  ocr_data: OcrDataPayload;
  ocr_skipped: boolean;
  enrich: VoterEnrichPageResult;
}

/**
 * Run OCR when missing, then upsert voters from OCR data (create + enrich).
 * Re-runs enrich even when ocr_data already exists — skips OCR in that case.
 */
export async function processAndEnrichBlockcodePage(
  db: Db,
  document: BlockCodeDocumentWithOcr
): Promise<ProcessAndEnrichResult> {
  if (document.tag === 'title') {
    throw new Error('Title pages cannot be processed for voters');
  }

  await db.collection('blockcodes').updateOne(
    { _id: document._id },
    { $set: { status: 'processing', processingStartedAt: new Date() } }
  );

  try {
    let ocr_data = document.ocr_data ?? null;
    let ocr_skipped = false;

    if (ocr_data) {
      ocr_skipped = true;
    } else {
      const pipeline = await runOcrPipeline(document.url);
      ocr_data = pipeline.ocr_data;
      await saveOcrDataToBlockcode(db, document._id, ocr_data);
    }

    const enrich = await enrichExistingVotersFromOcrData(db, document, ocr_data);

    await db.collection('blockcodes').updateOne(
      { _id: document._id },
      {
        $set: {
          status: 'completed',
          processedAt: new Date(),
          voterEnrichAt: new Date(),
          voterEnrichStats: persistedEnrichStats(enrich),
        },
        $unset: {
          voterEnrichClaimedAt: '',
          processingStartedAt: '',
        },
      }
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
      ocr_data,
      ocr_skipped,
      enrich,
    };
  } catch (error) {
    await db.collection('blockcodes').updateOne(
      { _id: document._id },
      { $set: { status: 'error' }, $unset: { processingStartedAt: '' } }
    );
    throw error;
  }
}
