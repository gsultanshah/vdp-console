import { NextResponse } from 'next/server';
import { forbiddenResponse, requireAdmin, unauthorizedResponse } from '@/lib/auth';
import { collectBillingUsage } from '@/lib/billing/usage';
import type { BillingActivityFilter, BillingPeriod } from '@/lib/billing/types';

export const dynamic = 'force-dynamic';

function parsePeriod(value: string | null): BillingPeriod {
  if (value === 'week' || value === 'month' || value === 'year' || value === 'all') {
    return value;
  }
  return 'month';
}

function parseActivity(value: string | null): BillingActivityFilter {
  const allowed: BillingActivityFilter[] = [
    'all',
    'voter_processing',
    'bulk_compilation',
    'exports',
    'parchi',
    'phone_enrich',
    'ocr',
    'infrastructure',
  ];
  if (value && allowed.includes(value as BillingActivityFilter)) {
    return value as BillingActivityFilter;
  }
  return 'all';
}

export async function GET(request: Request) {
  const admin = requireAdmin(request);
  if (!admin) {
    const hasSession = request.headers.get('cookie')?.includes('user=');
    return hasSession ? forbiddenResponse() : unauthorizedResponse();
  }

  try {
    const { searchParams } = new URL(request.url);
    const period = parsePeriod(searchParams.get('period'));
    const activity = parseActivity(searchParams.get('activity'));
    const usage = await collectBillingUsage(period, activity);
    return NextResponse.json(usage);
  } catch (error) {
    console.error('Billing usage error:', error);
    return NextResponse.json({ error: 'Failed to load billing usage' }, { status: 500 });
  }
}
