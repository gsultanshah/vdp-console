import { NextResponse } from 'next/server';
import { forbiddenResponse, requireAdmin, unauthorizedResponse } from '@/lib/auth';
import { canAccessHalka } from '@/lib/constituency-access';
import { resolveSessionUser } from '@/lib/session-user';
import { activeConstituencyExists } from '@/lib/constituency';
import {
  createPollingSchemeAiJob,
  listPollingSchemeAiJobs,
} from '@/lib/polling-scheme/ai-job-service';
import { MAX_POLLING_SCHEME_PDF_BYTES } from '@/lib/polling-scheme/ai-job-types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function authError(request: Request) {
  const hasSession = request.headers.get('cookie')?.includes('user=');
  return hasSession ? forbiddenResponse() : unauthorizedResponse();
}

export async function GET(request: Request) {
  const admin = requireAdmin(request);
  if (!admin) {
    return authError(request);
  }

  const { searchParams } = new URL(request.url);
  const halkaName = searchParams.get('halkaName');
  if (!halkaName) {
    return NextResponse.json({ error: 'halkaName is required' }, { status: 400 });
  }

  const sessionUser = await resolveSessionUser(request);
  if (!canAccessHalka(sessionUser, halkaName)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const jobs = await listPollingSchemeAiJobs(halkaName);
  return NextResponse.json({ jobs });
}

export async function POST(request: Request) {
  const admin = requireAdmin(request);
  if (!admin) {
    return authError(request);
  }

  const sessionUser = await resolveSessionUser(request);
  const operator = sessionUser?.email ?? admin.email ?? 'console';

  let body: {
    halkaName?: string;
    district?: string;
    fileName?: string;
    fileHash?: string;
    fileSizeBytes?: number;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const halkaName = body.halkaName?.replace(/\s+/g, '').toUpperCase();
  const fileName = body.fileName?.trim();
  const fileHash = body.fileHash?.trim().toLowerCase();
  const fileSizeBytes = Number(body.fileSizeBytes ?? 0);

  if (!halkaName || !fileName || !fileHash || !fileSizeBytes) {
    return NextResponse.json(
      { error: 'halkaName, fileName, fileHash, and fileSizeBytes are required' },
      { status: 400 }
    );
  }

  if (!/^[a-f0-9]{64}$/.test(fileHash)) {
    return NextResponse.json({ error: 'fileHash must be a SHA-256 hex string' }, { status: 400 });
  }

  if (fileSizeBytes > MAX_POLLING_SCHEME_PDF_BYTES) {
    return NextResponse.json({ error: 'File exceeds 100 MB limit' }, { status: 400 });
  }

  if (!fileName.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 });
  }

  if (!canAccessHalka(sessionUser, halkaName)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!(await activeConstituencyExists(halkaName))) {
    return NextResponse.json({ error: 'Active constituency not found' }, { status: 404 });
  }

  try {
    const result = await createPollingSchemeAiJob({
      halkaName,
      district: body.district,
      fileName,
      fileHash,
      fileSizeBytes,
      operator,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Create polling scheme AI job failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create job' },
      { status: 500 }
    );
  }
}
