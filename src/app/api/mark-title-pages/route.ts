import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { MongoClient } from 'mongodb';
import {
  claimNextBlockCode,
  countRemainingBlockCodes,
  markBlockCodeTitlePages,
  parseMarkTitlePageFilters,
  setBlockCodeLockStatus,
} from '@/lib/mark-title-pages';
import { pipelineTrackTitleTagged } from '@/lib/pipeline-hooks';

export const dynamic = 'force-dynamic';

/**
 * Mark title pages for one block code per request: OCR all pages, pick up to 3
 * title pages, tag the rest as regular.
 *
 * Auto-selects the next block code when `blockCode` is omitted.
 * Uses atomic findOneAndUpdate on blockcode_title_locks so parallel
 * workers never process the same block code.
 *
 * Query params:
 * - blockCode      Process a specific block code (atomically claimed)
 * - blockCodes     Comma-separated block codes to scope auto-select
 * - halkaName      Scope auto-select to a constituency
 * - retag          Default false — when true, re-tag block codes already marked done
 *
 * Parallel usage (10 workers):
 *   Promise.all(Array.from({ length: 10 }, () => drainQueue()))
 *   async function drainQueue() {
 *     while (true) {
 *       const res = await fetch('/api/mark-title-pages?blockCodes=1160010,1160011')
 *       if (res.status === 404) break
 *     }
 *   }
 */
export async function GET(request: Request) {
  let client: MongoClient | null = null;

  try {
    const filters = parseMarkTitlePageFilters(new URL(request.url).searchParams);

    if (!filters.blockCode && !filters.halkaName && !filters.blockCodes?.length) {
      return NextResponse.json(
        { error: 'Provide blockCode, blockCodes, or halkaName' },
        { status: 400 }
      );
    }

    await connectDB();
    client = new MongoClient(process.env.NEXT_PUBLIC_MONGODB_URI as string);
    await client.connect();
    const db = client.db('vdp');

    const claimed = await claimNextBlockCode(db, filters);

    if (!claimed) {
      const remaining = await countRemainingBlockCodes(db, filters);
      await client.close();
      return NextResponse.json(
        {
          error: 'No block codes available to tag',
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

    const { blockCode } = claimed;
    let result;
    let lockStatus: 'done' | 'error' = 'done';

    console.log(`[mark-title-pages] Claimed block code ${blockCode}`);

    try {
      result = await markBlockCodeTitlePages(db, blockCode, (progress) => {
        console.log(
          `[mark-title-pages] ${blockCode} OCR ${progress.index}/${progress.total}: ${progress.fileName}`
        );
      });
      await setBlockCodeLockStatus(db, blockCode, 'done');
      console.log(
        `[mark-title-pages] ${blockCode} done — ${result.titlesUpdated} title, ${result.regularUpdated} regular`
      );
      if (result.halkaName) {
        pipelineTrackTitleTagged(
          result.halkaName,
          blockCode,
          result.titlesUpdated + result.regularUpdated
        );
      }
    } catch (error) {
      lockStatus = 'error';
      await setBlockCodeLockStatus(db, blockCode, 'error');
      throw error;
    } finally {
      await client.close();
      client = null;
    }

    const remainingClient = new MongoClient(process.env.NEXT_PUBLIC_MONGODB_URI as string);
    await remainingClient.connect();
    const remainingDb = remainingClient.db('vdp');
    const remaining = await countRemainingBlockCodes(remainingDb, filters, blockCode);
    await remainingClient.close();

    return NextResponse.json({
      success: true,
      lockStatus,
      processed_block_code: {
        blockCode: result.blockCode,
        halkaName: result.halkaName,
        pagesScored: result.pagesScored,
        titlesUpdated: result.titlesUpdated,
        regularUpdated: result.regularUpdated,
        titlePages: result.titlePages,
      },
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

    console.error('Failed to mark title pages:', error);
    return NextResponse.json(
      {
        error: 'Failed to mark title pages',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
