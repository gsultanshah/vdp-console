import { NextResponse } from 'next/server';
import { forbiddenResponse, requireAdmin, unauthorizedResponse } from '@/lib/auth';
import { canAccessHalka } from '@/lib/constituency-access';
import { listLatestParchiForHalka, getLatestParchi } from '@/lib/voter-parchi/latest-store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function unauthorizedOrForbidden(request: Request) {
  const hasSession = request.headers.get('cookie')?.includes('user=');
  return hasSession ? forbiddenResponse() : unauthorizedResponse();
}

/** List latest parchi metadata for a halka, or one block. */
export async function GET(request: Request) {
  const admin = requireAdmin(request);
  if (!admin) {
    return unauthorizedOrForbidden(request);
  }

  const { searchParams } = new URL(request.url);
  const halkaName = (searchParams.get('halkaName') ?? '').trim();
  const blockCode = (searchParams.get('blockCode') ?? '').trim();

  if (!halkaName) {
    return NextResponse.json({ error: 'halkaName is required' }, { status: 400 });
  }
  if (!canAccessHalka(admin, halkaName)) {
    return forbiddenResponse();
  }

  if (blockCode) {
    const record = await getLatestParchi(halkaName, blockCode);
    return NextResponse.json({ item: record });
  }

  const items = await listLatestParchiForHalka(halkaName);
  return NextResponse.json({
    items: items.map((item) => ({
      blockCode: item.blockCode,
      fileName: item.fileName,
      voterCount: item.voterCount,
      pageCount: item.pageCount,
      sizeBytes: item.sizeBytes,
      source: item.source,
      generatedAt: item.generatedAt,
      genderFilter: item.genderFilter,
      downloadUrl: `/api/voter-parchi/latest/download/?halkaName=${encodeURIComponent(item.halkaName)}&blockCode=${encodeURIComponent(item.blockCode)}`,
    })),
  });
}
