import { NextResponse } from 'next/server';
import { forbiddenResponse, requireAdmin, unauthorizedResponse } from '@/lib/auth';
import { blockCodeFromPdfFileName } from '@/lib/pdf-utils';
import { processPdfUpload } from '@/lib/pdf-upload';
import { readPdfUploadJobs } from '@/lib/pipeline-tracker';
import { resolveSessionUser } from '@/lib/session-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_PDF_BYTES = 100 * 1024 * 1024;

export async function GET(request: Request) {
  const admin = requireAdmin(request);
  if (!admin) {
    const hasSession = request.headers.get('cookie')?.includes('user=');
    return hasSession ? forbiddenResponse() : unauthorizedResponse();
  }

  const { searchParams } = new URL(request.url);
  const halkaName = searchParams.get('halkaName');
  if (!halkaName) {
    return NextResponse.json({ error: 'halkaName is required' }, { status: 400 });
  }

  const jobs = await readPdfUploadJobs(halkaName.replace(/\s+/g, '').toUpperCase());
  const jobId = searchParams.get('jobId');
  if (jobId) {
    const job = jobs.find((item) => item.jobId === jobId);
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    return NextResponse.json({ job });
  }

  return NextResponse.json({ jobs: jobs.sort((a, b) => b.startedAt - a.startedAt) });
}

export async function POST(request: Request) {
  const admin = requireAdmin(request);
  if (!admin) {
    const hasSession = request.headers.get('cookie')?.includes('user=');
    return hasSession ? forbiddenResponse() : unauthorizedResponse();
  }

  const sessionUser = await resolveSessionUser(request);
  const operatorId = sessionUser?.email ?? admin.email ?? 'console';

  const formData = await request.formData();
  const file = formData.get('file');
  const halkaNameRaw = formData.get('halkaName');
  const blockCodeRaw = formData.get('blockCode');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'PDF file is required' }, { status: 400 });
  }

  if (typeof halkaNameRaw !== 'string' || !halkaNameRaw.trim()) {
    return NextResponse.json({ error: 'halkaName is required' }, { status: 400 });
  }

  if (!file.name.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 });
  }

  if (file.size > MAX_PDF_BYTES) {
    return NextResponse.json({ error: 'PDF exceeds 100 MB limit' }, { status: 400 });
  }

  const halkaName = halkaNameRaw.replace(/\s+/g, '').toUpperCase();
  const blockCode =
    typeof blockCodeRaw === 'string' && blockCodeRaw.trim()
      ? blockCodeRaw.trim()
      : blockCodeFromPdfFileName(file.name);

  const pdfBuffer = Buffer.from(await file.arrayBuffer());

  try {
    const job = await processPdfUpload({
      pdfBuffer,
      sourceFileName: file.name,
      halkaName,
      blockCode,
      operatorId,
    });

    return NextResponse.json({
      message: `Uploaded ${job.uploadedPages} of ${job.totalPages} pages from ${file.name}`,
      job,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PDF upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
