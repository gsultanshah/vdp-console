import { NextResponse } from 'next/server';
import { forbiddenResponse, requireAdmin, unauthorizedResponse } from '@/lib/auth';
import { resolveSessionUser } from '@/lib/session-user';
import { createPhoneEnrichJob } from '@/lib/phone-enrich/job-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const admin = requireAdmin(request);
  if (!admin) {
    const hasSession = request.headers.get('cookie')?.includes('user=');
    return hasSession ? forbiddenResponse() : unauthorizedResponse();
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }

  try {
    const sessionUser = await resolveSessionUser(request);
    const job = await createPhoneEnrichJob(file, admin, sessionUser);
    return NextResponse.json({ job });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start enrichment';
    const status = message.includes('Too many') || message.includes('No rows') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
