import { NextResponse } from 'next/server';
import { connectNativeMongoClient, type MongoClient } from '@/lib/mongo-client';
import connectDB from '@/lib/mongodb';
import {
  automationNotConfigured,
  automationUnauthorized,
  isAutomationConfigured,
  requireAutomationKey,
} from '@/lib/automation-auth';
import {
  claimNextPage,
  countRemainingPages,
  parseProcessPageFilters,
} from '@/lib/process-page';
import { processAndEnrichBlockcodePage } from '@/lib/blockcode-document';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export const runtime = 'nodejs';

/**
 * Same as /api/process-page?mode=enrich, gated for automator.
 * Keeps pipeline live tracker updates via blockcode-document hooks.
 */
export async function GET(request: Request) {
  if (!isAutomationConfigured()) return automationNotConfigured();
  if (!requireAutomationKey(request)) return automationUnauthorized();

  let client: MongoClient | null = null;

  try {
    const filters = parseProcessPageFilters(new URL(request.url).searchParams);

    await connectDB();
    client = await connectNativeMongoClient();
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

    const result = await processAndEnrichBlockcodePage(db, document);
    await client.close();
    client = null;

    const remainingClient = await connectNativeMongoClient();
    const remainingDb = remainingClient.db('vdp');
    const remaining = await countRemainingPages(remainingDb, { ...filters, pageId: null });
    await remainingClient.close();

    return NextResponse.json({
      success: true,
      processed_page: result.page,
      ocr_skipped: result.ocr_skipped,
      enrich: result.enrich,
      processed_count: result.enrich.created + result.enrich.enriched,
      error_count: result.enrich.errors,
      created_count: result.enrich.created,
      enriched_count: result.enrich.enriched,
      unchanged_count: result.enrich.unchanged,
      queue: {
        halkaName: filters.halkaName ?? null,
        blockCode: filters.blockCode ?? null,
        blockCodes: filters.blockCodes ?? null,
        remaining,
        has_more: remaining > 0,
      },
    });
  } catch (error) {
    if (client) await client.close();
    console.error('automation process-page failed', error);
    return NextResponse.json(
      {
        error: 'Failed to process page',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
