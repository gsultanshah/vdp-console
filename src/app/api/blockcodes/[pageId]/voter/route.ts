import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { MongoClient, ObjectId } from 'mongodb';
import { findBlockcodePage } from '@/lib/blockcode-document';
import { canAccessHalka } from '@/lib/constituency-access';
import { resolveSessionUser } from '@/lib/session-user';
import { saveVoterFromBlockcodeByCnic } from '@/lib/voter-document';

export const dynamic = 'force-dynamic';

/**
 * Upsert one voter from this page's OCR data.
 * POST body: { cnic: "37404-2611137-4" }
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

    const body = await request.json();
    const cnic = typeof body.cnic === 'string' ? body.cnic.trim() : '';
    if (!cnic) {
      return NextResponse.json({ error: 'cnic is required' }, { status: 400 });
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

    const result = await saveVoterFromBlockcodeByCnic(db, document, cnic);
    await client.close();

    return NextResponse.json({
      success: true,
      cnic: result.cnic,
      action: result.upserted ? 'created' : result.modified ? 'enriched' : 'unchanged',
    });
  } catch (error) {
    if (client) {
      await client.close();
    }
    console.error('Failed to upsert voter from page:', error);
    return NextResponse.json(
      {
        error: 'Failed to upsert voter',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
