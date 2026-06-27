import { NextResponse } from 'next/server';
import { forbiddenResponse, requireAdmin, unauthorizedResponse } from '@/lib/auth';
import { getExportJob } from '@/lib/voter-export';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const admin = requireAdmin(request);
  if (!admin) {
    const hasSession = request.headers.get('cookie')?.includes('user=');
    return hasSession ? forbiddenResponse() : unauthorizedResponse();
  }

  const job = await getExportJob(params.id);
  if (!job) {
    return NextResponse.json({ error: 'Export job not found' }, { status: 404 });
  }

  return NextResponse.json({ job });
}
