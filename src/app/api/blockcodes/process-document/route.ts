import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { MongoClient } from 'mongodb';
import {
  findBlockcodePage,
  processBlockcodeDocument,
  type ProcessDocumentMode,
} from '@/lib/blockcode-document';

export const dynamic = 'force-dynamic';

/**
 * Process a single blockcodes page by page_id or blockCode+fileName.
 *
 * Query params:
 * - page_id      MongoDB id of the blockcodes document
 * - blockCode    Alternative lookup with fileName
 * - fileName     Alternative lookup with blockCode
 * - mode         ocr_only | full (default: full)
 *   - ocr_only: run OCR and save/update ocr_data on the document
 *   - full: OCR + save ocr_data + save voters + mark completed
 */
export async function GET(request: Request) {
  let client: MongoClient | null = null;

  try {
    const { searchParams } = new URL(request.url);
    const pageId = searchParams.get('page_id');
    const blockCode = searchParams.get('blockCode');
    const fileName = searchParams.get('fileName');
    const modeParam = searchParams.get('mode') ?? 'full';
    const mode: ProcessDocumentMode = modeParam === 'ocr_only' ? 'ocr_only' : 'full';
    const origin = new URL(request.url).origin;

    if (!pageId && !(blockCode && fileName)) {
      return NextResponse.json(
        { error: 'Provide page_id or both blockCode and fileName' },
        { status: 400 }
      );
    }

    await connectDB();
    client = new MongoClient(process.env.NEXT_PUBLIC_MONGODB_URI as string);
    await client.connect();
    const db = client.db('vdp');

    const document = await findBlockcodePage(db, { pageId, blockCode, fileName });

    if (!document) {
      await client.close();
      return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    }

    const result = await processBlockcodeDocument(db, document, origin, { mode });
    await client.close();

    return NextResponse.json({
      success: true,
      ...result,
      processed_count: result.voters?.saved ?? 0,
      error_count: result.voters?.errors ?? 0,
    });
  } catch (error) {
    if (client) {
      await client.close();
    }

    console.error('Failed to process blockcode document:', error);
    return NextResponse.json(
      {
        error: 'Failed to process blockcode document',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
