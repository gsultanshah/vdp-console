import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { connectNativeMongoClient, type MongoClient } from '@/lib/mongo-client';
import { applyTagsForBlockCode } from '@/lib/mark-title-pages';
import { MAX_TITLE_PAGES } from '@/lib/title-page-detection';
import { pipelineTrackTitleTagged } from '@/lib/pipeline-hooks';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { blockCode, titlePageIds } = body as {
      blockCode?: string;
      titlePageIds?: string[];
    };

    if (!blockCode) {
      return NextResponse.json({ error: 'blockCode is required' }, { status: 400 });
    }

    const titleIds = Array.isArray(titlePageIds)
      ? titlePageIds.slice(0, MAX_TITLE_PAGES)
      : [];

    await connectDB();
    const client = await connectNativeMongoClient();
    const db = client.db('vdp');

    const { titlesUpdated, regularUpdated, titlePages } = await applyTagsForBlockCode(
      db,
      blockCode,
      titleIds
    );

    const samplePage = await db.collection('blockcodes').findOne(
      { blockCode },
      { projection: { halkaName: 1 } }
    );
    if (samplePage?.halkaName) {
      pipelineTrackTitleTagged(
        samplePage.halkaName as string,
        blockCode,
        titlesUpdated + regularUpdated
      );
    }

    await client.close();

    return NextResponse.json({
      blockCode,
      titlesUpdated,
      regularUpdated,
      titlePages,
    });
  } catch (error) {
    console.error('Error applying page tags:', error);
    return NextResponse.json(
      {
        error: 'Failed to apply page tags',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
