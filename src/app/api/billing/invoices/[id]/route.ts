import { NextResponse } from 'next/server';
import { forbiddenResponse, requireAdmin, unauthorizedResponse } from '@/lib/auth';
import { getInvoiceById, invoicePayUrl, invoiceShareUrl } from '@/lib/billing/invoices';
import { getBankAccountDetails } from '@/lib/billing/payment';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const admin = requireAdmin(request);
  if (!admin) {
    const hasSession = request.headers.get('cookie')?.includes('user=');
    return hasSession ? forbiddenResponse() : unauthorizedResponse();
  }

  try {
    const invoice = await getInvoiceById(params.id);
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    return NextResponse.json({
      invoice,
      shareUrl: invoiceShareUrl(invoice.shareToken),
      payUrl: invoicePayUrl(invoice.shareToken),
      bank: getBankAccountDetails(),
    });
  } catch (error) {
    console.error('Get invoice error:', error);
    return NextResponse.json({ error: 'Failed to load invoice' }, { status: 500 });
  }
}
