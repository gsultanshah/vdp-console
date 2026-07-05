import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { connectNativeMongoClient, ObjectId, type MongoClient } from '@/lib/mongo-client';
import { findBlockcodePage } from '@/lib/blockcode-document';
import { assertBlockCodeIsActive } from '@/lib/constituency';
import { canAccessHalka } from '@/lib/constituency-access';
import { blockcodeStorageDestination, uploadBufferToFirebaseStorage } from '@/lib/firebase-storage';
import { fetchImageBufferFromUrl, normalizeRotationDegrees, rotateImageBuffer } from '@/lib/rotate-page-image';
import { resolveSessionUser } from '@/lib/session-user';

export const dynamic = 'force-dynamic';

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

    const body = (await request.json()) as { degrees?: number };
    const degrees = Number(body.degrees);
    if (!Number.isFinite(degrees)) {
      return NextResponse.json({ error: 'degrees must be a number' }, { status: 400 });
    }

    const normalized = normalizeRotationDegrees(degrees);
    if (normalized === 0) {
      return NextResponse.json({ error: 'Rotation angle must not be 0°' }, { status: 400 });
    }

    await connectDB();
    client = await connectNativeMongoClient();
    const db = client.db('vdp');

    const document = await findBlockcodePage(db, { pageId });
    if (!document) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    }

    if (!canAccessHalka(sessionUser, document.halkaName)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const activeCheck = await assertBlockCodeIsActive(document.blockCode);
    if (!activeCheck.ok) {
      return NextResponse.json({ error: activeCheck.error }, { status: 403 });
    }

    const sourceBuffer = await fetchImageBufferFromUrl(document.url);
    const rotated = await rotateImageBuffer(sourceBuffer, normalized);
    const destination = blockcodeStorageDestination(
      document.halkaName,
      document.blockCode,
      document.fileName
    );
    const url = await uploadBufferToFirebaseStorage(rotated.buffer, destination, rotated.contentType);

    await db.collection('blockcodes').updateOne(
      { _id: document._id },
      {
        $set: {
          url,
          status: 'uploaded',
        },
        $unset: {
          ocr_data: '',
          ocrAt: '',
          processedAt: '',
          processingStartedAt: '',
        },
      }
    );

    return NextResponse.json({
      success: true,
      url,
      degrees: normalized,
      ocrCleared: true,
    });
  } catch (error) {
    console.error('Failed to rotate page image:', error);
    return NextResponse.json(
      {
        error: 'Failed to rotate page image',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
}
