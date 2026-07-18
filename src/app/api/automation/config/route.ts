import { NextResponse } from 'next/server';
import {
  automationNotConfigured,
  automationUnauthorized,
  isAutomationConfigured,
  requireAutomationKey,
} from '@/lib/automation-auth';
import { requireAdmin, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import {
  getEffectiveAutomationConfig,
  upsertAutomationConfig,
  type AutomationConfig,
} from '@/lib/automation-config';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const halkaName = searchParams.get('halkaName');

  // Automator or admin may read
  const isMachine = isAutomationConfigured() && requireAutomationKey(request);
  if (!isMachine) {
    const admin = requireAdmin(request);
    if (!admin) {
      const hasSession = request.headers.get('cookie')?.includes('user=');
      return hasSession ? forbiddenResponse() : unauthorizedResponse();
    }
  }

  const config = await getEffectiveAutomationConfig(halkaName);
  return NextResponse.json({ config });
}

export async function PUT(request: Request) {
  const admin = requireAdmin(request);
  if (!admin) {
    const hasSession = request.headers.get('cookie')?.includes('user=');
    return hasSession ? forbiddenResponse() : unauthorizedResponse();
  }

  try {
    const body = (await request.json()) as {
      scope?: 'global' | 'halka';
      halkaName?: string;
      config?: Partial<AutomationConfig>;
    };

    const scope = body.scope === 'halka' ? 'halka' : 'global';
    if (scope === 'halka' && !body.halkaName?.trim()) {
      return NextResponse.json({ error: 'halkaName required for halka scope' }, { status: 400 });
    }

    const config = await upsertAutomationConfig({
      scope,
      halkaName: body.halkaName,
      patch: body.config ?? {},
      updatedBy: admin.email,
    });

    return NextResponse.json({ config });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save config' },
      { status: 400 }
    );
  }
}

/** Machine health check helper */
export async function POST(request: Request) {
  if (!isAutomationConfigured()) return automationNotConfigured();
  if (!requireAutomationKey(request)) return automationUnauthorized();
  return NextResponse.json({ ok: true });
}
