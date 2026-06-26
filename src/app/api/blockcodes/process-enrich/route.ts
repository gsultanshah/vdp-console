import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { MongoClient } from 'mongodb';
import { canAccessHalka } from '@/lib/constituency-access';
import { resolveSessionUser } from '@/lib/session-user';
import {
  findBlockcodePage,
  processAndEnrichBlockcodePage,
} from '@/lib/blockcode-document';

export const dynamic = 'force-dynamic';

/**
 * OCR (if needed) + enrich voters for one blockcodes page.
 * Skips OCR when ocr_data already exists; always upserts voters from OCR rows.
 *
 * Query params:
 * - page_id    MongoDB id of the blockcodes document
 * - blockCode  Alternative lookup with fileName
 * - fileName   Alternative lookup with blockCode
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

    if (!canAccessHalka(sessionUser, document.halkaName)) {
      await client.close();
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const result = await processAndEnrichBlockcodePage(db, document);
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
