import { NextResponse } from 'next/server';
import { forbiddenResponse, requireAdmin, unauthorizedResponse } from '@/lib/auth';
import { generateInvoice, listInvoices } from '@/lib/billing/invoices';
import type { BillingActivityFilter, BillingPeriod } from '@/lib/billing/types';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const admin = requireAdmin(request);
  if (!admin) {
    const hasSession = request.headers.get('cookie')?.includes('user=');
    return hasSession ? forbiddenResponse() : unauthorizedResponse();
  }

  try {
    const invoices = await listInvoices(100);
    return NextResponse.json({ invoices });
  } catch (error) {
    console.error('List invoices error:', error);
    return NextResponse.json({ error: 'Failed to list invoices' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const admin = requireAdmin(request);
  if (!admin) {
    const hasSession = request.headers.get('cookie')?.includes('user=');
    return hasSession ? forbiddenResponse() : unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const period = (body.period as BillingPeriod) || 'month';
    const activity = (body.activity as BillingActivityFilter) || 'all';

    const invoice = await generateInvoice({
      period,
      activity,
      createdBy: admin._id,
      createdByName: admin.name,
      billingContact: {
        name: body.billingName || admin.name,
        email: body.billingEmail || admin.email,
        organization: body.organization || 'VDP Console',
      },
      notes: body.notes,
    });

    return NextResponse.json({ invoice }, { status: 201 });
  } catch (error) {
    console.error('Generate invoice error:', error);
    return NextResponse.json({ error: 'Failed to generate invoice' }, { status: 500 });
  }
}
