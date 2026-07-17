import { NextResponse } from 'next/server';
import { forbiddenResponse, requireAdmin, unauthorizedResponse } from '@/lib/auth';
import { canAccessHalka } from '@/lib/constituency-access';
import { softDeleteBlockCode } from '@/lib/blockcode-soft-delete';

export const dynamic = 'force-dynamic';

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

    const result = await softDeleteBlockCode({
      halkaName,
      blockCode,
      deletedBy: admin.email,
      deletedByName: admin.name,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete block code';
    const status =
      message.includes('required') || message.includes('not found') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
