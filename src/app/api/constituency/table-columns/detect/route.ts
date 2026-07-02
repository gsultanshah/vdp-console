import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import Constituency from '@/models/Constituency';
import BlockCode from '@/models/BlockCode';
import { canAccessHalka } from '@/lib/constituency-access';
import { resolveSessionUser } from '@/lib/session-user';
import { detectTableColumnsFromImage } from '@/lib/openai-column-detection';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const sessionUser = await resolveSessionUser(request);
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const pageId = body.pageId ? String(body.pageId) : '';

    if (!pageId) {
      return NextResponse.json({ error: 'pageId is required' }, { status: 400 });
    }

    await connectDB();

    if (!mongoose.Types.ObjectId.isValid(pageId)) {
      return NextResponse.json({ error: 'Invalid page id' }, { status: 400 });
    }

    const page = await BlockCode.findById(pageId).lean<{
      url?: string;
      halkaName?: string;
      blockCode?: string;
      fileName?: string;
    }>();
    if (!page) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    }

    if (page.halkaName && !canAccessHalka(sessionUser, page.halkaName)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const imageUrl = page.url;
    if (!imageUrl) {
      return NextResponse.json({ error: 'Selected page has no image URL' }, { status: 400 });
    }

    const columns = await detectTableColumnsFromImage(imageUrl);
    return NextResponse.json({
      columns,
      imageUrl,
      pageId,
      blockCode: page.blockCode,
      fileName: page.fileName,
    });
  } catch (error) {
    console.error('Column detection failed:', error);
    const message = error instanceof Error ? error.message : 'Column detection failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
