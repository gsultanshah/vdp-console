import { NextResponse } from 'next/server';
import { forbiddenResponse, requireAdmin, unauthorizedResponse } from '@/lib/auth';
import { canAccessHalka } from '@/lib/constituency-access';
import { resolveSessionUser } from '@/lib/session-user';
import {
  getPollingSchemeAiJob,
  markPollingSchemePdfUploaded,
} from '@/lib/polling-scheme/ai-job-service';
import {
  getSignedReadUrl,
  isPdfSignatureValid,
  verifyStorageObject,
} from '@/lib/firebase-storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function authError(request: Request) {
  const hasSession = request.headers.get('cookie')?.includes('user=');
  return hasSession ? forbiddenResponse() : unauthorizedResponse();
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const admin = requireAdmin(request);
  if (!admin) {
    return authError(request);
  }

  const job = await getPollingSchemeAiJob(params.id);
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const sessionUser = await resolveSessionUser(request);
  if (!canAccessHalka(sessionUser, job.halkaName)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { pageCount?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const pageCount = Number(body.pageCount ?? 0);
  if (!Number.isFinite(pageCount) || pageCount < 1) {
    return NextResponse.json({ error: 'pageCount must be a positive number' }, { status: 400 });
  }

  try {
    const verified = await verifyStorageObject(job.sourceStoragePath, job.fileSizeBytes);
    if (!verified.exists) {
      return NextResponse.json({ error: 'PDF not found in storage' }, { status: 400 });
    }

    const validPdf = await isPdfSignatureValid(job.sourceStoragePath);
    if (!validPdf) {
      return NextResponse.json({ error: 'Uploaded file is not a valid PDF' }, { status: 400 });
    }

    const sourceFileUrl = await getSignedReadUrl(job.sourceStoragePath);
    const updated = await markPollingSchemePdfUploaded(params.id, pageCount, sourceFileUrl);
    return NextResponse.json({ job: updated });
  } catch (error) {
    console.error('Mark PDF uploaded failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to verify upload' },
      { status: 500 }
    );
  }
}
