import { NextResponse } from 'next/server';
import { forbiddenResponse, requireAdmin, unauthorizedResponse } from '@/lib/auth';
import { getParchiJob, jobProgressPercent, processParchiBatch } from '@/lib/voter-parchi/job-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const job = await getParchiJob(params.id);
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    return NextResponse.json({ job, progressPercent: jobProgressPercent(job) });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load job' }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const admin = requireAdmin(request);
  if (!admin) {
    const hasSession = request.headers.get('cookie')?.includes('user=');
    return hasSession ? forbiddenResponse() : unauthorizedResponse();
  }

  try {
    const job = await processParchiBatch(params.id);
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    return NextResponse.json({ job, progressPercent: jobProgressPercent(job) });
  } catch (error) {
    console.error('Parchi batch failed:', error);
    return NextResponse.json({ error: 'Failed to process parchi batch' }, { status: 500 });
  }
}
