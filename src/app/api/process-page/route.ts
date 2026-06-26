import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { MongoClient } from 'mongodb';
import {
  claimNextPage,
  countRemainingPages,
  parseProcessPageFilters,
  processPageDocument,
} from '@/lib/process-page';

export const dynamic = 'force-dynamic';

/**
 * Process one voter-list page: OCR → save voters → update page status.
 *
 * Auto-selects the next available page when `page_id` is omitted.
 * Uses an atomic findOneAndUpdate to set status=processing, so parallel
 * requests (e.g. 50 workers) never claim the same page.
 *
 * Title pages (tag=title) are never selected or processed.
 *
 * Query params:
 * - page_id        Process a specific page (atomically claimed)
 * - halkaName      Scope auto-select to a constituency
 * - blockCode      Scope auto-select to one block code
 * - blockCodes     Comma-separated block codes (e.g. 1160010,1160011)
 * - tag            Only claim pages with this tag (cannot be "title")
 * - includeError   Default true — retry pages with status=error
 * - includeCompleted Default false — allow re-processing completed pages
 *
 * Parallel usage (50 workers):
 *   Promise.all(Array.from({ length: 50 }, () => drainQueue()))
 *   async function drainQueue() {
 *     while (true) {
 *       const res = await fetch('/api/process-page?blockCodes=1160010,1160011')
 *       if (res.status === 404) break
 *     }
 *   }
 */
export async function GET(request: Request) {
  let client: MongoClient | null = null;

  try {
    const filters = parseProcessPageFilters(new URL(request.url).searchParams);
    const origin = new URL(request.url).origin;

    await connectDB();
    client = new MongoClient(process.env.NEXT_PUBLIC_MONGODB_URI as string);
    await client.connect();
    const db = client.db('vdp');

    let document;
    try {
      document = await claimNextPage(db, filters);
    } catch (claimError) {
      await client.close();
      return NextResponse.json(
        {
          error: claimError instanceof Error ? claimError.message : 'Unable to claim page',
        },
        { status: 400 }
      );
    }

    if (!document) {
      const remaining = await countRemainingPages(db, filters);
      await client.close();
      return NextResponse.json(
        {
          error: 'No available pages to process',
          queue: {
            halkaName: filters.halkaName ?? null,
            blockCode: filters.blockCode ?? null,
            blockCodes: filters.blockCodes ?? null,
            remaining,
            has_more: remaining > 0,
          },
        },
        { status: 404 }
      );
    }

    const pageId = document._id.toString();
    let voterStats;
    let pageStatus: 'completed' | 'error' = 'completed';

    try {
      voterStats = await processPageDocument(document, origin, db);

      await db.collection('blockcodes').updateOne(
        { _id: document._id },
        { $set: { status: 'completed', processedAt: new Date() } }
      );
    } catch (error) {
      pageStatus = 'error';
      await db.collection('blockcodes').updateOne(
        { _id: document._id },
        { $set: { status: 'error' } }
      );
      throw error;
    } finally {
      await client.close();
      client = null;
    }

    const remainingFilters = { ...filters, pageId: null };
    const remainingClient = new MongoClient(process.env.NEXT_PUBLIC_MONGODB_URI as string);
    await remainingClient.connect();
    const remainingDb = remainingClient.db('vdp');
    const remaining = await countRemainingPages(remainingDb, remainingFilters);
    await remainingClient.close();

    return NextResponse.json({
      success: true,
      processed_page: {
        id: pageId,
        blockCode: document.blockCode,
        fileName: document.fileName,
        halkaName: document.halkaName,
        tag: document.tag ?? null,
        gender: document.gender ?? null,
        religion: document.religion ?? null,
        status: pageStatus,
      },
      voters: voterStats,
      ocr_saved: true,
      processed_count: voterStats.saved,
      error_count: voterStats.errors,
      queue: {
        halkaName: filters.halkaName ?? null,
        blockCode: filters.blockCode ?? null,
        blockCodes: filters.blockCodes ?? null,
        remaining,
        has_more: remaining > 0,
      },
    });
  } catch (error) {
    if (client) {
      await client.close();
    }

    console.error('Failed to process page:', error);
    return NextResponse.json(
      {
        error: 'Failed to process page',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
