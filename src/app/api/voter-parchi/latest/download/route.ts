import { NextResponse } from 'next/server';
import { forbiddenResponse, requireAdmin, unauthorizedResponse } from '@/lib/auth';
import { canAccessHalka } from '@/lib/constituency-access';
import { readLatestParchiFile } from '@/lib/voter-parchi/latest-store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const admin = requireAdmin(request);
  if (!admin) {
    const hasSession = request.headers.get('cookie')?.includes('user=');
    return hasSession ? forbiddenResponse() : unauthorizedResponse();
  }

  const { searchParams } = new URL(request.url);
  const halkaName = (searchParams.get('halkaName') ?? '').trim();
  const blockCode = (searchParams.get('blockCode') ?? '').trim();

  if (!halkaName || !blockCode) {
    return NextResponse.json({ error: 'halkaName and blockCode are required' }, { status: 400 });
  }
  if (!canAccessHalka(admin, halkaName)) {
    return forbiddenResponse();
  }

  const result = await readLatestParchiFile(halkaName, blockCode);
  if (!result) {
    return NextResponse.json({ error: 'No voter parchi found for this block code' }, { status: 404 });
  }

  if (!result.buffer.length) {
    return NextResponse.json({ error: 'Latest parchi PDF file is missing' }, { status: 404 });
  }

  return new NextResponse(result.buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${result.record.fileName}"`,
      'Cache-Control': 'no-store',
    },
  });
}
