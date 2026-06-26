import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import BlockCode from '@/models/BlockCode';
import { extractTextFromImageUrl } from '@/lib/ocr-text';
import { scoreTitlePage } from '@/lib/title-page-detection';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const pageId = searchParams.get('page_id');

    if (!pageId) {
      return NextResponse.json({ error: 'page_id is required' }, { status: 400 });
    }

    await connectDB();
    const page = await BlockCode.findById(pageId);

    if (!page) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    }

    const ocrText = await extractTextFromImageUrl(page.url);
    const score = scoreTitlePage(ocrText, page.fileName);

    return NextResponse.json({
      pageId: page._id.toString(),
      blockCode: page.blockCode,
      fileName: page.fileName,
      score,
      currentTag: page.tag,
    });
  } catch (error) {
    console.error('Error scoring title page:', error);
    return NextResponse.json(
      {
        error: 'Failed to score page',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
