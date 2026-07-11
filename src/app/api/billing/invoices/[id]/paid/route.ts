import { NextResponse } from 'next/server';
import { forbiddenResponse, requireAdmin, unauthorizedResponse } from '@/lib/auth';
import { markInvoicePaid } from '@/lib/billing/invoices';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const admin = requireAdmin(request);
  if (!admin) {
    const hasSession = request.headers.get('cookie')?.includes('user=');
    return hasSession ? forbiddenResponse() : unauthorizedResponse();
  }

  try {
    const invoice = await markInvoicePaid(params.id);
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }
    return NextResponse.json({ invoice });
  } catch (error) {
    console.error('Mark invoice paid error:', error);
    return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 });
  }
}
