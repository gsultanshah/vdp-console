import { NextResponse } from 'next/server';
import { forbiddenResponse, requireAdmin, unauthorizedResponse } from '@/lib/auth';
import { canAccessHalka } from '@/lib/constituency-access';
import {
  buildLatestParchiDownloadUrl,
  listLatestParchiForBlock,
  listLatestParchiForHalka,
  getLatestParchi,
} from '@/lib/voter-parchi/latest-store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function unauthorizedOrForbidden(request: Request) {
  const hasSession = request.headers.get('cookie')?.includes('user=');
  return hasSession ? forbiddenResponse() : unauthorizedResponse();
}

function serializeItem(item: Awaited<ReturnType<typeof getLatestParchi>>) {
  if (!item) return null;
  return {
    blockCode: item.blockCode,
    fileName: item.fileName,
    voterCount: item.voterCount,
    pageCount: item.pageCount,
    sizeBytes: item.sizeBytes,
    source: item.source,
    generatedAt: item.generatedAt,
    genderFilter: item.genderFilter,
    downloadUrl: buildLatestParchiDownloadUrl(item.halkaName, item.blockCode, item.genderFilter),
  };
}

/** List latest parchi metadata for a halka, or one block (all genders). */
export async function GET(request: Request) {
  const admin = requireAdmin(request);
  if (!admin) {
    return unauthorizedOrForbidden(request);
  }

  const { searchParams } = new URL(request.url);
  const halkaName = (searchParams.get('halkaName') ?? '').trim();
  const blockCode = (searchParams.get('blockCode') ?? '').trim();
  const genderFilterRaw = (searchParams.get('genderFilter') ?? '').trim();
  const genderFilter =
    genderFilterRaw === 'male' || genderFilterRaw === 'female' || genderFilterRaw === 'both'
      ? genderFilterRaw
      : null;

  if (!halkaName) {
    return NextResponse.json({ error: 'halkaName is required' }, { status: 400 });
  }
  if (!canAccessHalka(admin, halkaName)) {
    return forbiddenResponse();
  }

  if (blockCode) {
    if (genderFilter) {
      const record = await getLatestParchi(halkaName, blockCode, undefined, genderFilter);
      return NextResponse.json({ item: serializeItem(record), items: record ? [serializeItem(record)] : [] });
    }
    const items = await listLatestParchiForBlock(halkaName, blockCode);
    return NextResponse.json({
      items: items.map((item) => serializeItem(item)),
      item: serializeItem(items[0] ?? null),
    });
  }

  const items = await listLatestParchiForHalka(halkaName);
  return NextResponse.json({
    items: items.map((item) => serializeItem(item)),
  });
}
