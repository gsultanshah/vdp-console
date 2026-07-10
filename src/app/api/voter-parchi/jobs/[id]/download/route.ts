import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import { forbiddenResponse, requireAdmin, unauthorizedResponse } from '@/lib/auth';
import { canAccessHalka } from '@/lib/constituency-access';
import { getParchiJob, getParchiLocalFilePath } from '@/lib/voter-parchi/job-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const admin = requireAdmin(request);
  if (!admin) {
    const hasSession = request.headers.get('cookie')?.includes('user=');
    return hasSession ? forbiddenResponse() : unauthorizedResponse();
  }

  const job = await getParchiJob(params.id);
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }
  if (!canAccessHalka(admin, job.halkaName)) {
    return forbiddenResponse();
  }

  const { searchParams } = new URL(request.url);
  const fileName = searchParams.get('file')?.trim() ?? '';
  if (!fileName) {
    return NextResponse.json({ error: 'file query param is required' }, { status: 400 });
  }

  const known = job.outputFiles.some((f) => f.fileName === fileName);
  if (!known) {
    return NextResponse.json({ error: 'File not found for this job' }, { status: 404 });
  }

  const filePath = await getParchiLocalFilePath(params.id, fileName);
  if (!filePath) {
    // Prefer Firebase URL if local copy is gone.
    const remote = job.outputFiles.find((f) => f.fileName === fileName);
    if (remote?.downloadUrl && !remote.downloadUrl.startsWith('/api/')) {
      return NextResponse.redirect(remote.downloadUrl);
    }
    return NextResponse.json({ error: 'Local PDF file missing' }, { status: 404 });
  }

  const buffer = await fs.readFile(filePath);
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  });
}
