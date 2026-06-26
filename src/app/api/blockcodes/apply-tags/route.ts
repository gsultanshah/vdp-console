import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import BlockCode from '@/models/BlockCode';
import { MAX_TITLE_PAGES } from '@/lib/title-page-detection';

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
    const pages = await BlockCode.find({ blockCode }).select('_id fileName tag');

    if (!pages.length) {
      return NextResponse.json({ error: 'No pages found for block code' }, { status: 404 });
    }

    const validPageIds = new Set(pages.map((page) => page._id.toString()));
    const titleIdSet = new Set(
      titleIds.filter((id) => validPageIds.has(id)).slice(0, MAX_TITLE_PAGES)
    );

    let titlesUpdated = 0;
    let regularUpdated = 0;

    for (const page of pages) {
      const pageId = page._id.toString();
      const nextTag = titleIdSet.has(pageId) ? 'title' : 'regular';

      if (page.tag !== nextTag) {
        await BlockCode.updateOne({ _id: page._id }, { $set: { tag: nextTag } });
      }

      if (nextTag === 'title') {
        titlesUpdated += 1;
      } else {
        regularUpdated += 1;
      }
    }

    const titlePages = pages
      .filter((page) => titleIdSet.has(page._id.toString()))
      .map((page) => ({ id: page._id.toString(), fileName: page.fileName }));

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
