'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowUpTrayIcon,
  ChartBarIcon,
  ClipboardDocumentListIcon,
  Cog6ToothIcon,
  DocumentDuplicateIcon,
  MapIcon,
  RectangleStackIcon,
  SparklesIcon,
  UserGroupIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline';
import ConstituencyExportPanel from '@/components/constituency/ConstituencyExportPanel';
import ConstituencyVoterSearchPanel from '@/components/constituency/ConstituencyVoterSearchPanel';
import BlockCodeWorkProgressChart from '@/components/constituency/BlockCodeWorkProgressChart';
import PollingSchemePanel from '@/components/constituency/PollingSchemePanel';
import type { ConstituencyHomeData } from '@/lib/constituency-home-types';
import type { BlockWorkProgressSummary } from '@/lib/block-work-progress';

interface ConstituencyHomeProps {
  halkaName: string;
  onBack: () => void;
  onOpenVotersTable: () => void;
  onOpenVoterBrowser: () => void;
  onOpenUploadsTable: () => void;
  onOpenPagesBrowser: () => void;
  onBlockCodeSearch: (query: string) => void;
  onOpenColumnSettings?: () => void;
  canProcess: boolean;
  blockCodeSearch: string;
  workProgressSummary?: BlockWorkProgressSummary | null;
  workProgressLoading?: boolean;
  children?: ReactNode;
}

const STAT_THEMES = [
  { gradient: 'from-indigo-500 to-violet-600', glow: 'shadow-indigo-200/50', icon: UserGroupIcon },
  { gradient: 'from-sky-500 to-cyan-600', glow: 'shadow-sky-200/50', icon: MapIcon },
  { gradient: 'from-emerald-500 to-teal-600', glow: 'shadow-emerald-200/50', icon: DocumentDuplicateIcon },
  { gradient: 'from-amber-500 to-orange-600', glow: 'shadow-amber-200/50', icon: ChartBarIcon },
] as const;

const STATUS_COLORS: Record<string, string> = {
  completed: 'from-emerald-500 to-teal-500',
  processing: 'from-amber-500 to-orange-500',
  uploaded: 'from-sky-500 to-cyan-500',
  error: 'from-rose-500 to-pink-500',
  pending: 'from-slate-400 to-slate-500',
  failed: 'from-rose-500 to-red-500',
};

function formatNumber(value: number): string {
  return value.toLocaleString();
}

function completionPercent(pages: ConstituencyHomeData['pages']): number {
  if (pages.total <= 0) return pages.completed > 0 ? 100 : 0;
  return Math.min(100, Math.round((pages.completed / pages.total) * 100));
}

function GradientProgress({ value, barClass }: { value: number; barClass: string }) {
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className={`h-full rounded-full bg-gradient-to-r transition-all duration-700 ease-out ${barClass}`}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  loading,
  themeIndex,
}: {
  label: string;
  value: string;
  sub?: string;
  loading?: boolean;
  themeIndex: number;
}) {
  const theme = STAT_THEMES[themeIndex % STAT_THEMES.length];
  const Icon = theme.icon;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-white/60 bg-white p-5 shadow-lg ${theme.glow}`}
    >
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${theme.gradient}`} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          {loading ? (
            <div className="mt-3 h-9 w-24 animate-pulse rounded-lg bg-slate-200" />
          ) : (
            <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
          )}
          {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
        </div>
        <div className={`rounded-xl bg-gradient-to-br p-2.5 text-white shadow-sm ${theme.gradient}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function BarChartPanel({
  title,
  icon: Icon,
  iconClass,
  rows,
  loading,
}: {
  title: string;
  icon: typeof ChartBarIcon;
  iconClass: string;
  rows: { label: string; value: number; color: string }[];
  loading?: boolean;
}) {
  const max = Math.max(...rows.map((row) => row.value), 1);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-gradient-to-br from-indigo-50 to-violet-50 blur-2xl" />
      <div className="relative">
        <div className="flex items-center gap-2">
          <Icon className={`h-5 w-5 ${iconClass}`} />
          <h3 className="font-bold text-slate-900">{title}</h3>
        </div>
        <div className="mt-5 space-y-4">
          {loading
            ? Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="animate-pulse">
                  <div className="mb-2 h-3 w-24 rounded bg-slate-200" />
                  <div className="h-2.5 rounded-full bg-slate-100" />
                </div>
              ))
            : rows.map((row) => (
                <div key={row.label}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-600">{row.label}</span>
                    <span className="font-bold text-slate-900">{formatNumber(row.value)}</span>
                  </div>
                  <GradientProgress
                    value={Math.round((row.value / max) * 100)}
                    barClass={row.color}
                  />
                </div>
              ))}
        </div>
      </div>
    </div>
  );
}

export default function ConstituencyHome({
  halkaName,
  onBack,
  onOpenVotersTable,
  onOpenVoterBrowser,
  onOpenUploadsTable,
  onOpenPagesBrowser,
  onBlockCodeSearch,
  onOpenColumnSettings,
  canProcess,
  blockCodeSearch,
  workProgressSummary,
  workProgressLoading,
  children,
}: ConstituencyHomeProps) {
  const [data, setData] = useState<ConstituencyHomeData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [localBlockSearch, setLocalBlockSearch] = useState(blockCodeSearch);

  const loadOverview = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({ halkaName });
      const response = await fetch(`/api/constituency/overview/?${params.toString()}`);
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'Failed to load constituency overview');
      }
      const overview = (await response.json()) as ConstituencyHomeData;
      setData(overview);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to load overview');
    } finally {
      setIsLoading(false);
    }
  }, [halkaName]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    setLocalBlockSearch(blockCodeSearch);
  }, [blockCodeSearch]);

  const handleBlockSearch = (event: React.FormEvent) => {
    event.preventDefault();
    onBlockCodeSearch(localBlockSearch.trim());
  };

  const pct = data ? completionPercent(data.pages) : 0;

  const genderRows = data
    ? [
        { label: 'Male voters', value: data.voters.male, color: 'from-indigo-500 to-blue-500' },
        { label: 'Female voters', value: data.voters.female, color: 'from-violet-500 to-purple-500' },
      ]
    : [];

  const statusRows = data
    ? Object.entries(data.pages.byStatus)
        .sort(([, a], [, b]) => b - a)
        .map(([status, count]) => ({
          label: status.charAt(0).toUpperCase() + status.slice(1),
          value: count,
          color: STATUS_COLORS[status] ?? 'from-slate-400 to-slate-500',
        }))
    : [];

  const toolActions = [
    {
      label: 'Voter list',
      description: 'Paginated table with browse & profile links',
      icon: ClipboardDocumentListIcon,
      gradient: 'from-emerald-500 to-teal-600',
      onClick: onOpenVotersTable,
    },
    {
      label: 'Browse voters',
      description: 'Flip through voters one at a time',
      icon: UserGroupIcon,
      gradient: 'from-indigo-500 to-violet-600',
      onClick: onOpenVoterBrowser,
    },
    {
      label: 'Upload pages',
      description: 'View URLs, quick upload & batch process',
      icon: ArrowUpTrayIcon,
      gradient: 'from-sky-500 to-cyan-600',
      onClick: onOpenUploadsTable,
    },
    {
      label: 'Browse pages',
      description: 'Image viewer for uploaded scans',
      icon: RectangleStackIcon,
      gradient: 'from-amber-500 to-orange-600',
      onClick: onOpenPagesBrowser,
    },
    {
      label: 'Processing hub',
      description: 'OCR pipeline, bulk process & exports',
      icon: WrenchScrewdriverIcon,
      gradient: 'from-rose-500 to-pink-600',
      href: '/dashboard/processing/',
    },
    ...(canProcess && onOpenColumnSettings
      ? [
          {
            label: 'Table columns',
            description: 'OCR column detection & settings',
            icon: Cog6ToothIcon,
            gradient: 'from-slate-600 to-slate-800',
            onClick: onOpenColumnSettings,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-6 text-white shadow-xl shadow-indigo-300/30 sm:p-8">
        <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-8 -left-8 h-40 w-40 rounded-full bg-fuchsia-400/20 blur-2xl" />
        <div className="relative">
          <button
            onClick={onBack}
            className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-sm font-medium backdrop-blur-sm transition hover:bg-white/25"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            All constituencies
          </button>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <SparklesIcon className="h-6 w-6 text-amber-200" />
                <span className="text-sm font-semibold uppercase tracking-wider text-indigo-100">
                  Constituency home
                </span>
              </div>
              <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{halkaName}</h1>
              <p className="mt-2 max-w-xl text-indigo-100">
                {data
                  ? `${formatNumber(data.blockCodeCount)} block codes · ${formatNumber(data.voters.count)} registered voters · ${formatNumber(data.pages.total)} uploaded pages`
                  : 'Loading constituency overview…'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-2 ring-white/30 ${
                  data?.status === 'active' ? 'bg-emerald-400/20' : 'bg-white/10'
                }`}
              >
                {data?.status ?? '…'}
              </span>
              <button
                onClick={() => void loadOverview()}
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 rounded-xl bg-white/15 px-4 py-2 text-sm font-semibold backdrop-blur-sm transition hover:bg-white/25 disabled:opacity-50"
              >
                <ArrowPathIcon className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>

          {!isLoading && data && (
            <div className="mt-6 max-w-md">
              <div className="flex items-center justify-between text-sm font-medium text-indigo-100">
                <span>Page processing</span>
                <span>{pct}% complete</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-300 to-teal-200 transition-all duration-700"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {loadError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-center">
          <p className="text-sm text-red-700">{loadError}</p>
          <button
            onClick={() => void loadOverview()}
            className="mt-3 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Registered voters"
          value={data ? formatNumber(data.voters.count) : '—'}
          sub="Distinct CNICs in database"
          loading={isLoading}
          themeIndex={0}
        />
        <StatCard
          label="Block codes"
          value={data ? formatNumber(data.blockCodeCount) : '—'}
          sub="Electoral blocks in this halka"
          loading={isLoading}
          themeIndex={1}
        />
        <StatCard
          label="Uploaded pages"
          value={data ? formatNumber(data.pages.total) : '—'}
          sub={data ? `${formatNumber(data.pages.completed)} completed` : undefined}
          loading={isLoading}
          themeIndex={2}
        />
        <StatCard
          label="Processing"
          value={data ? `${completionPercent(data.pages)}%` : '—'}
          sub={
            data
              ? `${formatNumber(data.pages.processing)} active · ${formatNumber(data.pages.error)} errors`
              : undefined
          }
          loading={isLoading}
          themeIndex={3}
        />
      </div>

      <ConstituencyVoterSearchPanel halkaName={halkaName} />

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <BarChartPanel
          title="Voter gender breakdown"
          icon={UserGroupIcon}
          iconClass="text-indigo-600"
          rows={genderRows}
          loading={isLoading}
        />
        <BarChartPanel
          title="Pages by status"
          icon={ChartBarIcon}
          iconClass="text-emerald-600"
          rows={statusRows.length > 0 ? statusRows : [{ label: 'No pages yet', value: 0, color: 'from-slate-300 to-slate-400' }]}
          loading={isLoading}
        />
        <BlockCodeWorkProgressChart summary={workProgressSummary ?? null} loading={workProgressLoading} />
      </div>

      {/* Tools grid */}
      <div>
        <h2 className="text-lg font-bold text-slate-900">Tools & actions</h2>
        <p className="mt-1 text-sm text-slate-500">Browse, upload, process, and manage this constituency</p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {toolActions.map((action) => {
            const Icon = action.icon;
            const inner = (
              <>
                <div className={`rounded-xl bg-gradient-to-br p-2.5 text-white shadow-sm ${action.gradient}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-900">{action.label}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{action.description}</p>
                </div>
              </>
            );

            if ('href' in action && action.href) {
              return (
                <Link
                  key={action.label}
                  href={action.href}
                  className="group flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"
                >
                  {inner}
                </Link>
              );
            }

            return (
              <button
                key={action.label}
                type="button"
                onClick={action.onClick}
                className="group flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"
              >
                {inner}
              </button>
            );
          })}
        </div>
      </div>

      {/* Export */}
      <ConstituencyExportPanel halkaName={halkaName} voterCount={data?.voters.count ?? null} />

      <PollingSchemePanel halkaName={halkaName} />

      {/* Block codes section */}
      {children && (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">Block codes</h2>
          <p className="mt-1 text-sm text-slate-500">
            Per-block voter counts, estimates, and actions
          </p>
          <form onSubmit={handleBlockSearch} className="mt-4 flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row">
            <div className="relative flex-1">
              <MapIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-violet-500" />
              <input
                type="search"
                value={localBlockSearch}
                onChange={(event) => setLocalBlockSearch(event.target.value)}
                placeholder="Search block code…"
                className="block w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
              />
            </div>
            <button
              type="submit"
              className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90"
            >
              Find block
            </button>
          </form>
          <div className="mt-4">{children}</div>
        </div>
      )}
    </div>
  );
}
