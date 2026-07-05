import { NextResponse } from 'next/server';
import { findConstituencyByBlockCode } from '@/lib/constituency';
import { canAccessHalka } from '@/lib/constituency-access';
import { resolveSessionUser } from '@/lib/session-user';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const blockCode = searchParams.get('blockCode');
    const halkaNameParam = searchParams.get('halkaName');

    if (!blockCode) {
      return NextResponse.json({ error: 'blockCode is required' }, { status: 400 });
    }

    const sessionUser = await resolveSessionUser(request);
    const constituency = await findConstituencyByBlockCode(blockCode);

    if (!constituency) {
      if (halkaNameParam) {
        if (!canAccessHalka(sessionUser, halkaNameParam)) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        return NextResponse.json({
          blockCode,
          halkaName: halkaNameParam,
        });
      }
      return NextResponse.json({ error: 'Block code not found in any constituency' }, { status: 404 });
    }

    const halkaName = constituency.halkaName as string;
    if (!canAccessHalka(sessionUser, halkaName)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({
      blockCode,
      halkaName,
      constituencyLabel: constituency.label ?? constituency.name ?? halkaName,
      constituencyStatus: constituency.status ?? 'active',
    });
  } catch (error) {
    console.error('Error resolving block code context:', error);
    return NextResponse.json({ error: 'Failed to resolve block code context' }, { status: 500 });
  }
}
