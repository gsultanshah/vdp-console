import { NextResponse } from 'next/server';
import { forbiddenResponse, requireAdmin, unauthorizedResponse } from '@/lib/auth';
import { isFirebasePipelineConfigured } from '@/config/firebase';
import { readPipelineMeta, readPdfUploadJobs, readUploadSessions, syncPipelineCountsFromMongo } from '@/lib/pipeline-tracker';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const admin = requireAdmin(request);
  if (!admin) {
    const hasSession = request.headers.get('cookie')?.includes('user=');
    return hasSession ? forbiddenResponse() : unauthorizedResponse();
  }

  if (!isFirebasePipelineConfigured()) {
    return NextResponse.json(
      { configured: false, error: 'Firebase Realtime Database is not configured' },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const halkaName = searchParams.get('halkaName');
  if (!halkaName) {
    return NextResponse.json({ error: 'halkaName is required' }, { status: 400 });
  }

  const [meta, sessions, jobs] = await Promise.all([
    readPipelineMeta(halkaName),
    readUploadSessions(halkaName),
    readPdfUploadJobs(halkaName),
  ]);

  return NextResponse.json({
    configured: true,
    halkaName,
    meta,
    sessions,
    jobs,
  });
}

export async function POST(request: Request) {
  const admin = requireAdmin(request);
  if (!admin) {
    const hasSession = request.headers.get('cookie')?.includes('user=');
    return hasSession ? forbiddenResponse() : unauthorizedResponse();
  }

  if (!isFirebasePipelineConfigured()) {
    return NextResponse.json(
      { configured: false, error: 'Firebase Realtime Database is not configured' },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const halkaName = searchParams.get('halkaName');
  if (!halkaName) {
    return NextResponse.json({ error: 'halkaName is required' }, { status: 400 });
  }

  const meta = await syncPipelineCountsFromMongo(halkaName);
  const [sessions, jobs] = await Promise.all([
    readUploadSessions(halkaName),
    readPdfUploadJobs(halkaName),
  ]);

  return NextResponse.json({
    configured: true,
    halkaName,
    meta,
    sessions,
    jobs,
    synced: true,
  });
}
