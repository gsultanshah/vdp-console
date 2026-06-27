import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { MongoClient, ObjectId } from 'mongodb';
import { findBlockcodePage, processAndEnrichBlockcodePage } from '@/lib/blockcode-document';
import { canAccessHalka } from '@/lib/constituency-access';
import { resolveSessionUser } from '@/lib/session-user';

export const dynamic = 'force-dynamic';

/**
 * Enrich / create all voters from this page's OCR data.
 * Runs OCR first only when ocr_data is missing.
 */
export async function POST(
  request: Request,
  { params }: { params: { pageId: string } }
) {
  let client: MongoClient | null = null;

  try {
    const sessionUser = await resolveSessionUser(request);
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { pageId } = params;
    if (!ObjectId.isValid(pageId)) {
      return NextResponse.json({ error: 'Invalid page id' }, { status: 400 });
    }

    await connectDB();
    client = new MongoClient(process.env.NEXT_PUBLIC_MONGODB_URI as string);
    await client.connect();
    const db = client.db('vdp');

    const document = await findBlockcodePage(db, { pageId });
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
      ocr_skipped: result.ocr_skipped,
      enrich: result.enrich,
      createdCnics: result.enrich.createdCnics ?? [],
    });
  } catch (error) {
    if (client) {
      await client.close();
    }
    console.error('Failed to enrich page voters:', error);
    return NextResponse.json(
      {
        error: 'Failed to enrich voters',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
