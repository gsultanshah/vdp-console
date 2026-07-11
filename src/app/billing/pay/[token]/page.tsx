'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import InvoiceDocument from '@/components/billing/InvoiceDocument';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatUsdRange } from '@/lib/billing/pricing';
import type { BillingInvoice } from '@/lib/billing/types';
import type { BankAccountDetails } from '@/lib/billing/payment';

export default function PublicPaymentPage({ params }: { params: { token: string } }) {
  const [invoice, setInvoice] = useState<BillingInvoice | null>(null);
  const [bank, setBank] = useState<BankAccountDetails | null>(null);
  const [paymentReference, setPaymentReference] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      const response = await fetch(`/api/billing/share/${params.token}`);
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Invoice not found');
        return;
      }
      setInvoice(data.invoice);
      setBank(data.bank);
      setPaymentReference(data.paymentReference);
    }
    void load();
  }, [params.token]);

  if (error) {
    return <p className="text-center text-slate-600">{error}</p>;
  }

  if (!invoice || !bank) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-6 py-5">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-indigo-600">Secure payment instructions</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">Pay invoice {invoice.invoiceNumber}</h1>
        <p className="mt-2 text-sm text-slate-600">
          Estimated amount due: <span className="font-mono font-semibold text-indigo-700">{formatUsdRange(invoice.total)}</span>
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bank transfer details (USD)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-slate-500">Account name</p>
            <p className="font-medium">{bank.accountName}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Bank name</p>
            <p className="font-medium">{bank.bankName}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Branch</p>
            <p>{bank.branch}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Currency</p>
            <p className="font-mono">{bank.currency}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Account number</p>
            <p className="font-mono text-lg">{bank.accountNumber}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">IBAN</p>
            <p className="font-mono text-sm">{bank.iban}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">SWIFT / BIC</p>
            <p className="font-mono">{bank.swiftCode}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Payment reference (required)</p>
            <p className="font-mono text-lg font-semibold text-indigo-700">{paymentReference}</p>
          </div>
        </CardContent>
      </Card>

      <ul className="list-disc space-y-2 rounded-lg border bg-white px-6 py-4 text-sm text-slate-600">
        {bank.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
        <li>
          Questions? Email <a className="text-indigo-600 hover:underline" href={`mailto:${bank.supportEmail}`}>{bank.supportEmail}</a>
        </li>
      </ul>

      <InvoiceDocument
        invoice={invoice}
        bank={bank}
        paymentReference={paymentReference}
        showPaymentBlock
      />

      <div className="text-center">
        <Button variant="outline" asChild>
          <Link href={`/billing/invoice/${params.token}/`}>View invoice only</Link>
        </Button>
      </div>
    </div>
  );
}
