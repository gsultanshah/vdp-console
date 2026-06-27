import { NextResponse } from 'next/server';
import { forbiddenResponse, requireAdmin, unauthorizedResponse } from '@/lib/auth';
import { resumeExportJob } from '@/lib/voter-export';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const admin = requireAdmin(request);
  if (!admin) {
    const hasSession = request.headers.get('cookie')?.includes('user=');
    return hasSession ? forbiddenResponse() : unauthorizedResponse();
  }

  const job = await resumeExportJob(params.id);
  if (!job) {
    return NextResponse.json({ error: 'Export job not found' }, { status: 404 });
  }

  return NextResponse.json({ job });
}
