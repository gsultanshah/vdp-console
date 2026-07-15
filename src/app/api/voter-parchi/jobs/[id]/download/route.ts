import { NextResponse } from 'next/server';
import { forbiddenResponse, requireAdmin, unauthorizedResponse } from '@/lib/auth';
import { canAccessHalka } from '@/lib/constituency-access';
import { getParchiJob, getParchiLocalFilePath } from '@/lib/voter-parchi/job-service';
import { readStorageBackedPdfBuffer } from '@/lib/voter-parchi/parchi-file-storage';

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

  const remote = job.outputFiles.find((f) => f.fileName === fileName);
  const localPath = await getParchiLocalFilePath(params.id, fileName);
  const buffer = await readStorageBackedPdfBuffer({
    localPath,
    storagePath: remote?.storagePath,
    downloadUrl: remote?.downloadUrl,
  });

  if (!buffer) {
    return NextResponse.json({ error: 'PDF file missing' }, { status: 404 });
  }

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  });
}
