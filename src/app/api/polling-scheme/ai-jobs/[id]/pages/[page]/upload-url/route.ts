import { NextResponse } from 'next/server';
import { forbiddenResponse, requireAdmin, unauthorizedResponse } from '@/lib/auth';
import { canAccessHalka } from '@/lib/constituency-access';
import { resolveSessionUser } from '@/lib/session-user';
import {
  getPollingSchemeAiJob,
  getPollingSchemePageImagePath,
  markPageStatus,
} from '@/lib/polling-scheme/ai-job-service';
import {
  getSignedWriteUrl,
  uploadBufferToFirebaseStorage,
} from '@/lib/firebase-storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_PAGE_IMAGE_BYTES = 20 * 1024 * 1024;

function authError(request: Request) {
  const hasSession = request.headers.get('cookie')?.includes('user=');
  return hasSession ? forbiddenResponse() : unauthorizedResponse();
}

export async function GET(
  request: Request,
  { params }: { params: { id: string; page: string } }
) {
  const admin = requireAdmin(request);
  if (!admin) {
    return authError(request);
  }

  const page = Number(params.page);
  if (!Number.isFinite(page) || page < 1) {
    return NextResponse.json({ error: 'Invalid page number' }, { status: 400 });
  }

  const job = await getPollingSchemeAiJob(params.id);
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const sessionUser = await resolveSessionUser(request);
  if (!canAccessHalka(sessionUser, job.halkaName)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const imagePath = await getPollingSchemePageImagePath(job, page);
  const uploadUrl = await getSignedWriteUrl(imagePath, 'image/jpeg');

  await markPageStatus(params.id, page, {
    status: 'uploading',
    imagePath,
  });

  return NextResponse.json({ uploadUrl, imagePath });
}

export async function POST(
  request: Request,
  { params }: { params: { id: string; page: string } }
) {
  const admin = requireAdmin(request);
  if (!admin) {
    return authError(request);
  }

  const page = Number(params.page);
  if (!Number.isFinite(page) || page < 1) {
    return NextResponse.json({ error: 'Invalid page number' }, { status: 400 });
  }

  const job = await getPollingSchemeAiJob(params.id);
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const sessionUser = await resolveSessionUser(request);
  if (!canAccessHalka(sessionUser, job.halkaName)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const contentType = request.headers.get('content-type')?.split(';')[0];
  if (contentType !== 'image/jpeg') {
    return NextResponse.json({ error: 'Page image must be JPEG' }, { status: 415 });
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > MAX_PAGE_IMAGE_BYTES) {
    return NextResponse.json({ error: 'Page image exceeds 20 MB limit' }, { status: 413 });
  }

  const buffer = Buffer.from(await request.arrayBuffer());
  if (!buffer.length || buffer.length > MAX_PAGE_IMAGE_BYTES) {
    return NextResponse.json({ error: 'Invalid page image size' }, { status: 400 });
  }
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return NextResponse.json({ error: 'Invalid JPEG signature' }, { status: 400 });
  }

  const imagePath = await getPollingSchemePageImagePath(job, page);
  await markPageStatus(params.id, page, {
    status: 'uploading',
    imagePath,
  });

  await uploadBufferToFirebaseStorage(buffer, imagePath, 'image/jpeg');
  await markPageStatus(params.id, page, {
    status: 'uploaded',
    imagePath,
    imageHash: request.headers.get('x-image-sha256')?.trim() || undefined,
  });

  return NextResponse.json({ imagePath });
}
