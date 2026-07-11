'use client';

import { Badge } from '@/components/ui/badge';
import { formatUsdRange } from '@/lib/billing/pricing';
import type { BillingInvoice } from '@/lib/billing/types';
import type { BankAccountDetails } from '@/lib/billing/payment';

interface InvoiceDocumentProps {
  invoice: BillingInvoice;
  bank?: BankAccountDetails;
  paymentReference?: string;
  showPaymentBlock?: boolean;
}

function statusVariant(status: BillingInvoice['status']): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (status === 'paid') return 'default';
  if (status === 'issued') return 'secondary';
  if (status === 'void') return 'destructive';
  return 'outline';
}

export default function InvoiceDocument({
  invoice,
  bank,
  paymentReference,
  showPaymentBlock = false,
}: InvoiceDocumentProps) {
  return (
    <div className="mx-auto max-w-4xl rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-950 px-6 py-5 text-white">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-slate-400">VDP Cloud Platform</p>
            <h1 className="mt-1 text-2xl font-semibold">Usage Invoice</h1>
            <p className="mt-1 font-mono text-sm text-slate-300">{invoice.invoiceNumber}</p>
          </div>
          <Badge variant={statusVariant(invoice.status)} className="capitalize">
            {invoice.status}
          </Badge>
        </div>
      </div>

      <div className="grid gap-6 border-b border-slate-100 px-6 py-5 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bill to</p>
          <p className="mt-2 font-medium text-slate-900">{invoice.billingContact.organization}</p>
          <p className="text-sm text-slate-600">{invoice.billingContact.name}</p>
          <p className="text-sm text-slate-600">{invoice.billingContact.email}</p>
        </div>
        <div className="sm:text-right">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Billing period</p>
          <p className="mt-2 text-sm text-slate-700">
            {new Date(invoice.periodStart).toLocaleDateString()} –{' '}
            {new Date(invoice.periodEnd).toLocaleDateString()}
          </p>
          <p className="mt-2 text-xs font-mono text-slate-500">
            scope={invoice.period} · filter={invoice.activity}
          </p>
          <p className="mt-1 text-sm text-slate-600">Due {new Date(invoice.dueAt).toLocaleDateString()}</p>
        </div>
      </div>

      <div className="overflow-x-auto px-6 py-5">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-4 font-semibold">SKU</th>
              <th className="py-2 pr-4 font-semibold">Description</th>
              <th className="py-2 pr-4 font-semibold">Qty</th>
              <th className="py-2 pr-4 font-semibold">Unit</th>
              <th className="py-2 pr-4 font-semibold">Unit price (USD)</th>
              <th className="py-2 text-right font-semibold">Amount (USD)</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lineItems.map((item) => (
              <tr key={item.sku} className="border-b border-slate-100">
                <td className="py-3 pr-4 font-mono text-xs text-indigo-700">{item.sku}</td>
                <td className="py-3 pr-4 text-slate-700">{item.description}</td>
                <td className="py-3 pr-4 font-mono">{item.quantity.toLocaleString()}</td>
                <td className="py-3 pr-4 text-slate-500">{item.unit}</td>
                <td className="py-3 pr-4 font-mono text-xs">{formatUsdRange(item.unitPrice, 4)}</td>
                <td className="py-3 text-right font-mono text-xs">{formatUsdRange(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border-t border-slate-100 px-6 py-5">
        <div className="ml-auto max-w-sm space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Subtotal</span>
            <span className="font-mono">{formatUsdRange(invoice.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Infrastructure & network</span>
            <span className="font-mono">{formatUsdRange(invoice.infrastructure)}</span>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold">
            <span>Estimated total</span>
            <span className="font-mono text-indigo-700">{formatUsdRange(invoice.total)}</span>
          </div>
        </div>
        {invoice.notes ? <p className="mt-4 text-xs text-slate-500">{invoice.notes}</p> : null}
      </div>

      {showPaymentBlock && bank ? (
        <div className="border-t border-slate-200 bg-slate-50 px-6 py-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Wire transfer instructions</h2>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <p className="text-xs text-slate-500">Account name</p>
              <p className="font-medium">{bank.accountName}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Bank</p>
              <p className="font-medium">{bank.bankName}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Account number</p>
              <p className="font-mono">{bank.accountNumber}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">IBAN</p>
              <p className="font-mono text-xs">{bank.iban}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">SWIFT / BIC</p>
              <p className="font-mono">{bank.swiftCode}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Payment reference</p>
              <p className="font-mono text-indigo-700">{paymentReference}</p>
            </div>
          </div>
          <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-slate-600">
            {bank.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
