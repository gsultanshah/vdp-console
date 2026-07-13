import { NextResponse } from 'next/server';
import { forbiddenResponse, requireAdmin, unauthorizedResponse } from '@/lib/auth';
import { canAccessHalka } from '@/lib/constituency-access';
import { resolveSessionUser } from '@/lib/session-user';
import {
  getPollingSchemeAiJob,
  updatePollingSchemeAiJobStatus,
} from '@/lib/polling-scheme/ai-job-service';

export const dynamic = 'force-dynamic';

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

  const updated = await updatePollingSchemeAiJobStatus(params.id, 'cancelled');
  return NextResponse.json({ job: updated });
}
