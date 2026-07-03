import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { connectNativeMongoClient, type MongoClient } from '@/lib/mongo-client';
import { canAccessHalka } from '@/lib/constituency-access';
import { resolveSessionUser } from '@/lib/session-user';
import {
  findBlockcodePage,
  processAndEnrichBlockcodePage,
} from '@/lib/blockcode-document';

export const dynamic = 'force-dynamic';

/**
 * OCR (if needed, or when force=true) + enrich voters for one blockcodes page.
 *
 * Query params:
 * - page_id    MongoDB id of the blockcodes document
 * - blockCode  Alternative lookup with fileName
 * - fileName   Alternative lookup with blockCode
 * - force      When true, re-run OCR even if ocr_data exists
 */
export async function GET(request: Request) {
  let client: MongoClient | null = null;

  try {
    const sessionUser = await resolveSessionUser(request);
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const pageId = searchParams.get('page_id');
    const blockCode = searchParams.get('blockCode');
    const fileName = searchParams.get('fileName');
    const force = searchParams.get('force') === 'true';

    if (!pageId && !(blockCode && fileName)) {
      return NextResponse.json(
        { error: 'Provide page_id or both blockCode and fileName' },
        { status: 400 }
      );
    }

    await connectDB();
    client = await connectNativeMongoClient();
    const db = client.db('vdp');

    const document = await findBlockcodePage(db, { pageId, blockCode, fileName });

    if (!document) {
      await client.close();
      return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    }

    if (!canAccessHalka(sessionUser, document.halkaName)) {
      await client.close();
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const result = await processAndEnrichBlockcodePage(db, document, { force });
    await client.close();

    return NextResponse.json({
      success: true,
      processed_page: result.page,
      ocr_skipped: result.ocr_skipped,
      enrich: result.enrich,
      processed_count: result.enrich.created + result.enrich.enriched,
      error_count: result.enrich.errors,
    });
  } catch (error) {
    if (client) {
      await client.close();
    }

    console.error('Failed to process and enrich blockcode page:', error);
    return NextResponse.json(
      {
        error: 'Failed to process and enrich page',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
