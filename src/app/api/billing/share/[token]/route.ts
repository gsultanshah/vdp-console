import { NextResponse } from 'next/server';
import { getInvoiceByShareToken } from '@/lib/billing/invoices';
import { buildPaymentReference, getBankAccountDetails } from '@/lib/billing/payment';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: { token: string } }
) {
  try {
    const invoice = await getInvoiceByShareToken(params.token);
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const bank = getBankAccountDetails();
    return NextResponse.json({
      invoice,
      bank,
      paymentReference: buildPaymentReference(invoice.invoiceNumber),
    });
  } catch (error) {
    console.error('Public invoice error:', error);
    return NextResponse.json({ error: 'Failed to load invoice' }, { status: 500 });
  }
}
