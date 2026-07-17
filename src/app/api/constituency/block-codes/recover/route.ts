import { NextResponse } from 'next/server';
import { forbiddenResponse, requireAdmin, unauthorizedResponse } from '@/lib/auth';
import { canAccessHalka } from '@/lib/constituency-access';
import {
  listDeletedBlockCodes,
  restoreDeletedBlockCode,
} from '@/lib/blockcode-soft-delete';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const admin = requireAdmin(request);
  if (!admin) {
    const hasSession = request.headers.get('cookie')?.includes('user=');
    return hasSession ? forbiddenResponse() : unauthorizedResponse();
  }

  try {
    const items = await listDeletedBlockCodes();
    const filtered = items.filter((item) => canAccessHalka(admin, item.halkaName));
    return NextResponse.json({ items: filtered });
  } catch (error) {
    console.error('List deleted block codes failed:', error);
    return NextResponse.json({ error: 'Failed to list deleted block codes' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const admin = requireAdmin(request);
  if (!admin) {
    const hasSession = request.headers.get('cookie')?.includes('user=');
    return hasSession ? forbiddenResponse() : unauthorizedResponse();
  }

  try {
    const body = (await request.json()) as {
      halkaName?: string;
      blockCode?: string;
    };
    const halkaName = String(body.halkaName ?? '').trim();
    const blockCode = String(body.blockCode ?? '').trim();

    if (!halkaName || !blockCode) {
      return NextResponse.json({ error: 'halkaName and blockCode are required' }, { status: 400 });
    }
    if (!canAccessHalka(admin, halkaName)) {
      return forbiddenResponse();
    }

    const result = await restoreDeletedBlockCode({ halkaName, blockCode });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to restore block code';
    const status =
      message.includes('required') ||
      message.includes('not found') ||
      message.includes('already active')
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
