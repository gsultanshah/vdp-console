import { NextResponse } from 'next/server';
import { forbiddenResponse, requireAdmin, unauthorizedResponse } from '@/lib/auth';
import { canAccessHalka } from '@/lib/constituency-access';
import {
  createBlockCodeRenameJob,
  getBlockCodeRenameJob,
  processBlockCodeRenameStep,
} from '@/lib/blockcode-rename';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request) {
  const admin = requireAdmin(request);
  if (!admin) {
    const hasSession = request.headers.get('cookie')?.includes('user=');
    return hasSession ? forbiddenResponse() : unauthorizedResponse();
  }

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId')?.trim() ?? '';
  if (!jobId) {
    return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
  }

  try {
    const job = await getBlockCodeRenameJob(jobId);
    if (!job) {
      return NextResponse.json({ error: 'Rename job not found' }, { status: 404 });
    }
    if (!canAccessHalka(admin, job.halkaName)) {
      return forbiddenResponse();
    }
    return NextResponse.json({ job });
  } catch (error) {
    console.error('Load block code rename job failed:', error);
    return NextResponse.json({ error: 'Failed to load rename job' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const admin = requireAdmin(request);
  if (!admin) {
    const hasSession = request.headers.get('cookie')?.includes('user=');
    return hasSession ? forbiddenResponse() : unauthorizedResponse();
  }

  try {
    const body = (await request.json()) as {
      halkaName?: string;
      oldBlockCode?: string;
      newBlockCode?: string;
      jobId?: string;
      action?: 'create' | 'process';
    };

    const action = body.action ?? (body.jobId ? 'process' : 'create');

    if (action === 'process') {
      const jobId = String(body.jobId ?? '').trim();
      if (!jobId) {
        return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
      }

      const existing = await getBlockCodeRenameJob(jobId);
      if (!existing) {
        return NextResponse.json({ error: 'Rename job not found' }, { status: 404 });
      }
      if (!canAccessHalka(admin, existing.halkaName)) {
        return forbiddenResponse();
      }

      const job = await processBlockCodeRenameStep(jobId);
      return NextResponse.json({ job });
    }

    const halkaName = String(body.halkaName ?? '').trim();
    const oldBlockCode = String(body.oldBlockCode ?? '').trim();
    const newBlockCode = String(body.newBlockCode ?? '').trim();

    if (!halkaName || !oldBlockCode || !newBlockCode) {
      return NextResponse.json(
        { error: 'halkaName, oldBlockCode, and newBlockCode are required' },
        { status: 400 }
      );
    }
    if (!canAccessHalka(admin, halkaName)) {
      return forbiddenResponse();
    }

    const job = await createBlockCodeRenameJob({
      halkaName,
      oldBlockCode,
      newBlockCode,
      createdBy: admin.email,
      createdByName: admin.name,
    });

    return NextResponse.json({ job });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to rename block code';
    const status =
      message.includes('required') ||
      message.includes('not found') ||
      message.includes('already exists') ||
      message.includes('different') ||
      message.includes('digits')
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
