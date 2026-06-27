import fs from 'fs/promises';
import { NextResponse } from 'next/server';
import { forbiddenResponse, requireAdmin, unauthorizedResponse } from '@/lib/auth';
import { getExportDownloadPath } from '@/lib/voter-export';

export const dynamic = 'force-dynamic';

function contentTypeForFileName(fileName: string): string {
  if (fileName.endsWith('.xlsx')) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  return 'text/csv; charset=utf-8';
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const admin = requireAdmin(request);
  if (!admin) {
    const hasSession = request.headers.get('cookie')?.includes('user=');
    return hasSession ? forbiddenResponse() : unauthorizedResponse();
  }

  const { searchParams } = new URL(request.url);
  const fileName = searchParams.get('file');
  if (!fileName) {
    return NextResponse.json({ error: 'file query parameter is required' }, { status: 400 });
  }

  const download = await getExportDownloadPath(params.id, fileName);
  if (!download) {
    return NextResponse.json({ error: 'Export file not found' }, { status: 404 });
  }

  try {
    const buffer = await fs.readFile(download.filePath);
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentTypeForFileName(download.downloadName),
        'Content-Disposition': `attachment; filename="${download.downloadName}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to read export file' }, { status: 500 });
  }
}
