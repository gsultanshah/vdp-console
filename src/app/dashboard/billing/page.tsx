'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  ArrowPathIcon,
  BanknotesIcon,
  ChartBarIcon,
  ClipboardDocumentIcon,
  CloudIcon,
  DocumentTextIcon,
  LinkIcon,
  ServerStackIcon,
} from '@heroicons/react/24/outline';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import InvoiceDocument from '@/components/billing/InvoiceDocument';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatUsdRange } from '@/lib/billing/pricing';
import type { BillingActivityFilter, BillingInvoice, BillingPeriod, BillingUsageSummary } from '@/lib/billing/types';

const PERIOD_OPTIONS: Array<{ id: BillingPeriod; label: string }> = [
  { id: 'week', label: 'Last 7 days' },
  { id: 'month', label: 'This month' },
  { id: 'year', label: 'This year' },
  { id: 'all', label: 'All telemetry' },
];

const ACTIVITY_OPTIONS: Array<{ id: BillingActivityFilter; label: string }> = [
  { id: 'all', label: 'All activity' },
  { id: 'voter_processing', label: 'Voter processing' },
  { id: 'bulk_compilation', label: 'Bulk compilation' },
  { id: 'exports', label: 'Exports' },
  { id: 'parchi', label: 'Voter parchi' },
  { id: 'phone_enrich', label: 'Phone enrich' },
  { id: 'ocr', label: 'OCR / pages' },
  { id: 'infrastructure', label: 'Infrastructure' },
];

export default function BillingDashboardPage() {
  const router = useRouter();
  const [period, setPeriod] = useState<BillingPeriod>('month');
  const [activity, setActivity] = useState<BillingActivityFilter>('all');
  const [usage, setUsage] = useState<BillingUsageSummary | null>(null);
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<BillingInvoice | null>(null);
  const [shareUrl, setShareUrl] = useState('');
  const [payUrl, setPayUrl] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [billingName, setBillingName] = useState('');
  const [billingEmail, setBillingEmail] = useState('');
  const [organization, setOrganization] = useState('VDP Console');

  const chartData = useMemo(() => {
    if (!usage) return [];
    return usage.dailySeries.map((point) => ({
      date: point.date.slice(5),
      costMin: point.cost.min,
      costMax: point.cost.max,
      voters: point.voterUnits,
      sessions: point.bulkSessions,
    }));
  }, [usage]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const userStr = localStorage.getItem('user');
      const user = userStr ? JSON.parse(userStr) : null;
      if (!user || user.role !== 'admin') {
        toast.error('Admin access required');
        router.replace('/dashboard');
        return;
      }

      const [usageRes, invoicesRes] = await Promise.all([
        fetch(`/api/billing/usage?period=${period}&activity=${activity}`, { credentials: 'include' }),
        fetch('/api/billing/invoices', { credentials: 'include' }),
      ]);

      if (usageRes.status === 403 || usageRes.status === 401) {
        router.replace('/dashboard');
        return;
      }

      const usageData = await usageRes.json();
      const invoicesData = await invoicesRes.json();

      if (!usageRes.ok) throw new Error(usageData.error || 'Failed to load usage');
      if (!invoicesRes.ok) throw new Error(invoicesData.error || 'Failed to load invoices');

      setUsage(usageData);
      setInvoices(invoicesData.invoices || []);
      if (!billingName) setBillingName(user.name || '');
      if (!billingEmail) setBillingEmail(user.email || '');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load billing data');
    } finally {
      setIsLoading(false);
    }
  }, [period, activity, router, billingName, billingEmail]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleGenerateInvoice = async () => {
    setIsGenerating(true);
    try {
      const response = await fetch('/api/billing/invoices', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period, activity, billingName, billingEmail, organization }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to generate invoice');

      setInvoices((prev) => [data.invoice, ...prev]);
      setSelectedInvoice(data.invoice);
      const detailRes = await fetch(`/api/billing/invoices/${data.invoice._id}`, { credentials: 'include' });
      const detail = await detailRes.json();
      if (detailRes.ok) {
        setShareUrl(detail.shareUrl);
        setPayUrl(detail.payUrl);
      }
      toast.success('Invoice generated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate invoice');
    } finally {
      setIsGenerating(false);
    }
  };

  const openInvoice = async (invoice: BillingInvoice) => {
    setSelectedInvoice(invoice);
    try {
      const response = await fetch(`/api/billing/invoices/${invoice._id}`, { credentials: 'include' });
      const data = await response.json();
      if (response.ok) {
        setShareUrl(data.shareUrl);
        setPayUrl(data.payUrl);
      }
    } catch {
      // ignore
    }
  };

  const copyLink = async (url: string, label: string) => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    toast.success(`${label} copied`);
  };

  const markPaid = async (id: string) => {
    const response = await fetch(`/api/billing/invoices/${id}/paid`, {
      method: 'POST',
      credentials: 'include',
    });
    const data = await response.json();
    if (!response.ok) {
      toast.error(data.error || 'Failed to mark paid');
      return;
    }
    setInvoices((prev) => prev.map((inv) => (inv._id === id ? data.invoice : inv)));
    if (selectedInvoice?._id === id) setSelectedInvoice(data.invoice);
    toast.success('Invoice marked as paid');
  };

  if (isLoading && !usage) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-6 text-white shadow-lg">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-slate-400">VDP Cloud Billing</p>
            <h1 className="mt-2 text-3xl font-bold">Usage & Cost Telemetry</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              Metered compute for voter processing, bulk compilation sessions, and multi-region infrastructure overhead.
            </p>
          </div>
          <Button variant="secondary" onClick={() => void loadData()} disabled={isLoading}>
            <ArrowPathIcon className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          {PERIOD_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setPeriod(option.id)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                period === option.id
                  ? 'bg-indigo-500 text-white'
                  : 'bg-white/10 text-slate-200 hover:bg-white/20'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <CardDescription className="font-mono text-xs">EST. DAILY BURN</CardDescription>
            <CardTitle className="font-mono text-lg">
              {usage ? formatUsdRange(usage.costs.dailyEstimate) : '—'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-500">Range: $17.93 – $29.12 / day</CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <CardDescription className="font-mono text-xs">VOTER PROCESSING</CardDescription>
            <CardTitle className="font-mono text-lg">
              {usage ? formatUsdRange(usage.costs.voterProcessing) : '—'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-500">
            {usage?.metrics.votersProcessed.toLocaleString() ?? 0} units @ $0.0029 – $0.0087
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <CardDescription className="font-mono text-xs">BULK SESSIONS</CardDescription>
            <CardTitle className="font-mono text-lg">
              {usage ? formatUsdRange(usage.costs.bulkCompilation) : '—'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-500">
            {usage?.metrics.bulkSessions ?? 0} sessions @ $3.723 – $9.232
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <CardDescription className="font-mono text-xs">INFRA / NETWORK</CardDescription>
            <CardTitle className="font-mono text-lg">
              {usage ? formatUsdRange(usage.costs.infrastructure) : '—'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-500">Platform range $79.146 – $189.289</CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          <Label>Activity filter</Label>
          <Select value={activity} onValueChange={(v) => setActivity(v as BillingActivityFilter)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTIVITY_OPTIONS.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <p className="text-sm text-slate-500">
            Window: {usage ? `${new Date(usage.rangeStart).toLocaleDateString()} – ${new Date(usage.rangeEnd).toLocaleDateString()}` : '—'}
          </p>
        </div>
      </div>

      <Tabs defaultValue="telemetry" className="space-y-4">
        <TabsList>
          <TabsTrigger value="telemetry">Telemetry</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="generate">Generate invoice</TabsTrigger>
        </TabsList>

        <TabsContent value="telemetry" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ChartBarIcon className="h-5 w-5" />
                Daily cost estimate
              </CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value) => `$${Number(value ?? 0).toFixed(2)}`} />
                  <Bar dataKey="costMax" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ServerStackIcon className="h-5 w-5" />
                Activity stream
              </CardTitle>
              <CardDescription>{usage?.metrics.totalEvents ?? 0} billable events in selected window</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3">Timestamp</th>
                    <th className="py-2 pr-3">SKU</th>
                    <th className="py-2 pr-3">Resource</th>
                    <th className="py-2 pr-3">Qty</th>
                    <th className="py-2 pr-3">Region</th>
                    <th className="py-2 text-right">Cost (USD)</th>
                  </tr>
                </thead>
                <tbody>
                  {(usage?.activities ?? []).slice(0, 100).map((row) => (
                    <tr key={row.id} className="border-b border-slate-100">
                      <td className="py-2 pr-3 font-mono text-xs">{new Date(row.timestamp).toLocaleString()}</td>
                      <td className="py-2 pr-3 font-mono text-xs text-indigo-700">{row.sku}</td>
                      <td className="py-2 pr-3 text-slate-600">{row.resource}</td>
                      <td className="py-2 pr-3 font-mono">
                        {row.quantity} {row.unit}
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs">{row.region}</td>
                      <td className="py-2 text-right font-mono text-xs">{formatUsdRange(row.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invoices" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DocumentTextIcon className="h-5 w-5" />
                Issued invoices
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {invoices.length === 0 ? (
                <p className="text-sm text-slate-500">No invoices yet. Generate one from current usage.</p>
              ) : (
                invoices.map((invoice) => (
                  <div
                    key={invoice._id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3"
                  >
                    <div>
                      <p className="font-mono text-sm font-medium">{invoice.invoiceNumber}</p>
                      <p className="text-xs text-slate-500">
                        {new Date(invoice.periodStart).toLocaleDateString()} –{' '}
                        {new Date(invoice.periodEnd).toLocaleDateString()} · {formatUsdRange(invoice.total)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="capitalize">{invoice.status}</Badge>
                      <Button size="sm" variant="outline" onClick={() => void openInvoice(invoice)}>
                        View
                      </Button>
                      {invoice.status !== 'paid' ? (
                        <Button size="sm" variant="secondary" onClick={() => void markPaid(invoice._id)}>
                          Mark paid
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {selectedInvoice ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => void copyLink(shareUrl, 'Share link')}>
                  <LinkIcon className="mr-2 h-4 w-4" />
                  Copy share link
                </Button>
                <Button size="sm" variant="outline" onClick={() => void copyLink(payUrl, 'Payment link')}>
                  <BanknotesIcon className="mr-2 h-4 w-4" />
                  Copy payment link
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/billing/pay/${selectedInvoice.shareToken}/`} target="_blank">
                    Open payment page
                  </Link>
                </Button>
              </div>
              <InvoiceDocument invoice={selectedInvoice} />
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="generate">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CloudIcon className="h-5 w-5" />
                Generate invoice from telemetry
              </CardTitle>
              <CardDescription>
                Creates a shareable invoice and payment page for the selected period ({period}) and activity filter.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Billing contact name</Label>
                  <Input value={billingName} onChange={(e) => setBillingName(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label>Billing email</Label>
                  <Input type="email" value={billingEmail} onChange={(e) => setBillingEmail(e.target.value)} />
                </div>
                <div className="grid gap-2 sm:col-span-2">
                  <Label>Organization</Label>
                  <Input value={organization} onChange={(e) => setOrganization(e.target.value)} />
                </div>
              </div>
              <div className="rounded-lg border bg-slate-50 p-4 text-sm">
                <p className="font-medium text-slate-700">Estimated total for current filters</p>
                <p className="mt-1 font-mono text-lg text-indigo-700">
                  {usage ? formatUsdRange(usage.costs.total) : '—'}
                </p>
              </div>
              <Button onClick={() => void handleGenerateInvoice()} disabled={isGenerating}>
                <ClipboardDocumentIcon className="mr-2 h-4 w-4" />
                {isGenerating ? 'Generating...' : 'Generate invoice'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
