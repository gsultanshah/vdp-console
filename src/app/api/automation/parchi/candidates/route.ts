import { NextResponse } from 'next/server';
import {
  automationNotConfigured,
  automationUnauthorized,
  isAutomationConfigured,
  requireAutomationKey,
} from '@/lib/automation-auth';
import { listParchiCandidates } from '@/lib/automation-parchi';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!isAutomationConfigured()) return automationNotConfigured();
  if (!requireAutomationKey(request)) return automationUnauthorized();

  const halkaName = new URL(request.url).searchParams.get('halkaName')?.trim();
  if (!halkaName) {
    return NextResponse.json({ error: 'halkaName is required' }, { status: 400 });
  }

  try {
    const items = await listParchiCandidates(halkaName);
    return NextResponse.json({ items });
  } catch (error) {
    console.error('parchi candidates failed', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list candidates' },
      { status: 500 }
    );
  }
}
