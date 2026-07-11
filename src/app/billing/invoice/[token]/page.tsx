'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import InvoiceDocument from '@/components/billing/InvoiceDocument';
import { Button } from '@/components/ui/button';
import type { BillingInvoice } from '@/lib/billing/types';

export default function PublicInvoicePage({ params }: { params: { token: string } }) {
  const [invoice, setInvoice] = useState<BillingInvoice | null>(null);
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
    }
    void load();
  }, [params.token]);

  if (error) {
    return <p className="text-center text-slate-600">{error}</p>;
  }

  if (!invoice) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-slate-500">Shared invoice</p>
        <Button asChild>
          <Link href={`/billing/pay/${params.token}/`}>Proceed to payment</Link>
        </Button>
      </div>
      <InvoiceDocument invoice={invoice} />
    </div>
  );
}
