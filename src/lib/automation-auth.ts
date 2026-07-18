import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';

function readAutomationKey(): string | null {
  const key = process.env.VDP_AUTOMATION_API_KEY;
  if (!key || !key.trim()) return null;
  return key.trim();
}

export function isAutomationConfigured(): boolean {
  return Boolean(readAutomationKey());
}

/**
 * Authenticate machine callers (vdp-automator Lambdas).
 * Additive — does not affect session cookie auth used by the console UI.
 */
export function requireAutomationKey(request: Request): boolean {
  const expected = readAutomationKey();
  if (!expected) return false;

  const provided =
    request.headers.get('x-vdp-automation-key') ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    '';

  if (!provided || provided.length !== expected.length) {
    return false;
  }

  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function automationUnauthorized() {
  return NextResponse.json({ error: 'Unauthorized automation caller' }, { status: 401 });
}

export function automationNotConfigured() {
  return NextResponse.json(
    { error: 'VDP_AUTOMATION_API_KEY is not configured on the console' },
    { status: 503 }
  );
}
