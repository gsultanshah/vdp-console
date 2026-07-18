import { NextResponse } from 'next/server';
import {
  automationNotConfigured,
  automationUnauthorized,
  isAutomationConfigured,
  requireAutomationKey,
} from '@/lib/automation-auth';
import { ensureAutomationParchiJob } from '@/lib/automation-parchi';
import { PollingStationRequiredError } from '@/lib/voter-parchi/job-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!isAutomationConfigured()) return automationNotConfigured();
  if (!requireAutomationKey(request)) return automationUnauthorized();

  try {
    const body = (await request.json()) as {
      halkaName?: string;
      blockCode?: string;
      fingerprint?: string;
    };
    const halkaName = String(body.halkaName ?? '').trim();
    const blockCode = String(body.blockCode ?? '').trim();
    if (!halkaName || !blockCode) {
      return NextResponse.json({ error: 'halkaName and blockCode are required' }, { status: 400 });
    }

    const result = await ensureAutomationParchiJob({
      halkaName,
      blockCode,
      fingerprint: body.fingerprint,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PollingStationRequiredError) {
      return NextResponse.json(
        { error: error.message, code: 'POLLING_STATION_REQUIRED', blockCode: error.blockCode },
        { status: 409 }
      );
    }
    console.error('ensure parchi job failed', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to ensure parchi job' },
      { status: 500 }
    );
  }
}
