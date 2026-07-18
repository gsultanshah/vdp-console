import { NextResponse } from 'next/server';
import {
  automationNotConfigured,
  automationUnauthorized,
  isAutomationConfigured,
  requireAutomationKey,
} from '@/lib/automation-auth';
import { getAutomationJob, processAutomationParchiBatch } from '@/lib/automation-parchi';
import { jobProgressPercent } from '@/lib/voter-parchi/job-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const runtime = 'nodejs';

async function resolveJobId(request: Request): Promise<string> {
  const fromQuery = new URL(request.url).searchParams.get('jobId')?.trim();
  if (fromQuery) return fromQuery;
  try {
    const body = (await request.json()) as { jobId?: string };
    return String(body.jobId ?? '').trim();
  } catch {
    return '';
  }
}

export async function POST(request: Request) {
  if (!isAutomationConfigured()) return automationNotConfigured();
  if (!requireAutomationKey(request)) return automationUnauthorized();

  const jobId = await resolveJobId(request);
  if (!jobId) {
    return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
  }

  try {
    const job = await processAutomationParchiBatch(jobId);
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    return NextResponse.json({ job, progressPercent: jobProgressPercent(job) });
  } catch (error) {
    console.error('automation parchi batch failed', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process batch' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  if (!isAutomationConfigured()) return automationNotConfigured();
  if (!requireAutomationKey(request)) return automationUnauthorized();

  const jobId = new URL(request.url).searchParams.get('jobId')?.trim();
  if (!jobId) {
    return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
  }

  const job = await getAutomationJob(jobId);
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  return NextResponse.json({ job, progressPercent: jobProgressPercent(job) });
}
