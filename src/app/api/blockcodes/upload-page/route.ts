import { NextResponse } from 'next/server';
import { connectNativeMongoClient, type MongoClient } from '@/lib/mongo-client';
import { uploadBufferToFirebaseStorage } from '@/lib/firebase-storage';
import { assertBlockCodeIsActive } from '@/lib/constituency';
import { canAccessHalka } from '@/lib/constituency-access';
import { resolveSessionUser } from '@/lib/session-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_PAGE_BYTES = 20 * 1024 * 1024;

function safeFileName(fileName: string): string {
  const fallback = `page-${Date.now()}.jpg`;
  const trimmed = fileName.trim() || fallback;
  return trimmed.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
}

export async function POST(request: Request) {
  let client: MongoClient | null = null;

  try {
    const sessionUser = await resolveSessionUser(request);
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const blockCodeRaw = formData.get('blockCode');
    const halkaNameRaw = formData.get('halkaName');
    const tagRaw = formData.get('tag');
    const genderRaw = formData.get('gender');
    const religionRaw = formData.get('religion');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Page image is required' }, { status: 400 });
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image files are supported' }, { status: 400 });
    }

    if (file.size > MAX_PAGE_BYTES) {
      return NextResponse.json({ error: 'Page image exceeds 20 MB limit' }, { status: 400 });
    }

    if (typeof blockCodeRaw !== 'string' || !blockCodeRaw.trim()) {
      return NextResponse.json({ error: 'blockCode is required' }, { status: 400 });
    }

    if (typeof halkaNameRaw !== 'string' || !halkaNameRaw.trim()) {
      return NextResponse.json({ error: 'halkaName is required' }, { status: 400 });
    }

    const blockCode = blockCodeRaw.trim();
    const halkaName = halkaNameRaw.trim();
    const tag = typeof tagRaw === 'string' && tagRaw.trim() ? tagRaw.trim() : 'page';
    const gender = genderRaw === 'female' ? 'female' : 'male';
    const religion = religionRaw === 'qadiani' ? 'qadiani' : 'muslim';

    if (!canAccessHalka(sessionUser, halkaName)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const activeCheck = await assertBlockCodeIsActive(blockCode);
    if (!activeCheck.ok) {
      return NextResponse.json({ error: activeCheck.error }, { status: 403 });
    }

    const originalFileName = safeFileName(file.name);
    const fileName = `${Date.now()}-${originalFileName}`;
    const destination = `${halkaName}/${blockCode}/${fileName}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const url = await uploadBufferToFirebaseStorage(buffer, destination, file.type);

    client = await connectNativeMongoClient();
    const db = client.db('vdp');
    const insertResult = await db.collection('blockcodes').insertOne({
      blockCode,
      fileName,
      url,
      tag,
      halkaName,
      gender,
      religion,
      status: 'uploaded',
      uploadedAt: new Date(),
      sourceUpload: originalFileName,
    });

    const upload = {
      _id: String(insertResult.insertedId),
      blockCode,
      fileName,
      url,
      tag,
      halkaName,
      gender,
      religion,
      status: 'uploaded',
      uploadedAt: new Date().toISOString(),
    };

    return NextResponse.json({ success: true, upload });
  } catch (error) {
    console.error('Failed to upload blockcode page:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to upload page' },
      { status: 500 }
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
}
