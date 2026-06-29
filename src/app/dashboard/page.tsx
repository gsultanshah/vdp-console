'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MotionDiv } from '@/components/ui/Motion';
import {
  BuildingLibraryIcon,
  DocumentTextIcon,
  MapIcon,
  UserGroupIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ChartBarIcon,
  MagnifyingGlassIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';

interface PageStats {
  total: number;
  completed: number;
  processing: number;
  error: number;
  uploaded: number;
}

interface ConstituencyOverview {
  _id: string;
  halkaName: string;
  status: string;
  totalVoters: number;
  muslimFemale: number;
  muslimMale: number;
  qadianiFemale: number;
  qadianiMale: number;
  blockCodeCount: number;
  lastUpdated: string | null;
  pages: PageStats;
}

interface DashboardOverview {
  access: {
    isAdmin: boolean;
    hasAllAccess: boolean;
    allowedHalkaName: string | null;
    userName: string;
  };
  summary: {
    constituencyCount: number;
    activeCount: number;
    totalVoters: number;
    totalBlockCodes: number;
    pagesTotal: number;
    pagesUploaded: number;
    pagesCompleted: number;
    pagesProcessing: number;
    pagesError: number;
  };
  constituencies: ConstituencyOverview[];
}

const CARD_THEMES = [
  {
    gradient: 'from-indigo-500 to-violet-600',
    glow: 'shadow-indigo-200/60',
    iconBg: 'bg-indigo-500/15 text-indigo-600',
    bar: 'from-indigo-500 to-violet-500',
  },
  {
    gradient: 'from-emerald-500 to-teal-600',
    glow: 'shadow-emerald-200/60',
    iconBg: 'bg-emerald-500/15 text-emerald-600',
    bar: 'from-emerald-500 to-teal-500',
  },
  {
    gradient: 'from-sky-500 to-cyan-600',
    glow: 'shadow-sky-200/60',
    iconBg: 'bg-sky-500/15 text-sky-600',
    bar: 'from-sky-500 to-cyan-500',
  },
  {
    gradient: 'from-amber-500 to-orange-600',
    glow: 'shadow-amber-200/60',
    iconBg: 'bg-amber-500/15 text-amber-600',
    bar: 'from-amber-500 to-orange-500',
  },
] as const;

function formatNumber(value: number): string {
  return value.toLocaleString();
}

function completionPercent(pages: PageStats): number {
  if (pages.total <= 0) {
    return pages.completed > 0 ? 100 : 0;
  }
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

function ConstituencyCard({
  constituency,
  accentIndex = 0,
}: {
  constituency: ConstituencyOverview;
  accentIndex?: number;
}) {
  const pct = completionPercent(constituency.pages);
  const theme = CARD_THEMES[accentIndex % CARD_THEMES.length];

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-indigo-100/80">
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${theme.gradient}`} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold tracking-tight text-slate-900">{constituency.halkaName}</h3>
          <p className="mt-1 text-sm text-slate-500">
            {formatNumber(constituency.blockCodeCount)} block codes ·{' '}
            {formatNumber(constituency.totalVoters)} voters
          </p>
        </div>
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
            constituency.status === 'active'
              ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
              : 'bg-slate-50 text-slate-600 ring-slate-500/20'
          }`}
        >
          {constituency.status}
        </span>
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between text-xs font-medium text-slate-600">
          <span>Processing progress</span>
          <span className={`bg-gradient-to-r bg-clip-text text-transparent ${theme.gradient}`}>
            {pct}%
          </span>
        </div>
        <GradientProgress value={pct} barClass={theme.bar} />
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Pages', value: constituency.pages.total, color: 'text-slate-900' },
            { label: 'Done', value: constituency.pages.completed, color: 'text-emerald-600' },
            { label: 'Active', value: constituency.pages.processing, color: 'text-amber-600' },
            { label: 'Errors', value: constituency.pages.error, color: 'text-rose-600' },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl bg-slate-50 px-3 py-2">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                {stat.label}
              </dt>
              <dd className={`text-base font-bold ${stat.color}`}>{formatNumber(stat.value)}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link
          href="/dashboard/constituency"
          className={`inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 ${theme.gradient}`}
        >
          Open constituency
          <ArrowRightIcon className="h-4 w-4" />
        </Link>
        <Link
          href="/dashboard/search-voters"
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
        >
          Search voters
        </Link>
      </div>
    </div>
  );
}

function VoterBreakdownPanel({ constituency }: { constituency: ConstituencyOverview }) {
  const rows = [
    { label: 'Muslim male', value: constituency.muslimMale, color: 'from-indigo-500 to-blue-500' },
    { label: 'Muslim female', value: constituency.muslimFemale, color: 'from-violet-500 to-purple-500' },
    { label: 'Qadiani male', value: constituency.qadianiMale, color: 'from-teal-500 to-emerald-500' },
    { label: 'Qadiani female', value: constituency.qadianiFemale, color: 'from-rose-500 to-pink-500' },
  ];
  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br from-violet-100 to-indigo-50 blur-2xl" />
      <div className="relative">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-violet-500/10 p-2">
            <ChartBarIcon className="h-5 w-5 text-violet-600" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">Voter breakdown</h3>
        </div>
        <dl className="mt-5 space-y-4">
          {rows.map((row) => (
            <div key={row.label}>
              <div className="mb-1.5 flex justify-between text-sm">
                <dt className="font-medium text-slate-600">{row.label}</dt>
                <dd className="font-bold tabular-nums text-slate-900">{formatNumber(row.value)}</dd>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-2 rounded-full bg-gradient-to-r ${row.color}`}
                  style={{ width: `${Math.max(4, (row.value / max) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/dashboard/overview/')
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? 'Failed to load dashboard');
        }
        setOverview(data as DashboardOverview);
      })
      .catch((fetchError) => {
        setError(fetchError instanceof Error ? fetchError.message : 'Failed to load dashboard');
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
        <div className="relative">
          <div className="h-14 w-14 animate-spin rounded-full border-[3px] border-indigo-200 border-t-indigo-600" />
          <div className="absolute inset-0 h-14 w-14 animate-ping rounded-full border border-indigo-300/40" />
        </div>
        <p className="text-sm font-medium text-slate-500">Loading your dashboard…</p>
      </div>
    );
  }

  if (error || !overview) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-red-50 px-5 py-6 text-sm text-rose-800">
        {error ?? 'Unable to load dashboard overview.'}
      </div>
    );
  }

  const { access, summary, constituencies } = overview;
  const singleConstituency = !access.hasAllAccess && constituencies.length === 1 ? constituencies[0] : null;
  const overallPct =
    summary.pagesTotal > 0
      ? Math.round((summary.pagesCompleted / summary.pagesTotal) * 100)
      : 0;

  const summaryCards = [
    {
      name: access.hasAllAccess ? 'Constituencies' : 'Your constituency',
      value: access.hasAllAccess
        ? `${summary.activeCount} / ${summary.constituencyCount}`
        : (singleConstituency?.halkaName ?? access.allowedHalkaName ?? '—'),
      icon: BuildingLibraryIcon,
      hint: access.hasAllAccess ? 'Active across platform' : 'Your assigned area',
    },
    {
      name: 'Estimated voters',
      value: formatNumber(summary.totalVoters),
      icon: UserGroupIcon,
      hint: 'Registered estimates',
    },
    {
      name: 'Block codes',
      value: formatNumber(summary.totalBlockCodes),
      icon: MapIcon,
      hint: 'Polling areas',
    },
    {
      name: 'Pages processed',
      value: `${formatNumber(summary.pagesCompleted)} / ${formatNumber(summary.pagesTotal)}`,
      icon: DocumentTextIcon,
      hint: `${overallPct}% complete`,
    },
  ];

  const quickLinks = [
    {
      href: '/dashboard/constituency',
      label: 'Constituency browser',
      desc: 'Browse uploads & block codes',
      icon: BuildingLibraryIcon,
      gradient: 'from-indigo-500 to-violet-600',
      bg: 'from-indigo-50 to-violet-50',
    },
    {
      href: '/dashboard/search-voters',
      label: 'Search voters',
      desc: 'Find voters by CNIC or name',
      icon: MagnifyingGlassIcon,
      gradient: 'from-emerald-500 to-teal-600',
      bg: 'from-emerald-50 to-teal-50',
    },
    {
      href: '/dashboard/reports',
      label: 'Reports',
      desc: 'Export and analyze data',
      icon: ChartBarIcon,
      gradient: 'from-amber-500 to-orange-600',
      bg: 'from-amber-50 to-orange-50',
    },
  ];

  return (
    <div className="space-y-8 pb-4">
      {/* Hero */}
      <MotionDiv
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 px-6 py-8 text-white shadow-xl shadow-indigo-500/25 sm:px-8 sm:py-10"
      >
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur-sm">
              <SparklesIcon className="h-4 w-4 text-amber-200" />
              VDP Console
            </div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {access.hasAllAccess ? 'Platform overview' : 'Your dashboard'}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-indigo-100 sm:text-base">
              Welcome back, <span className="font-semibold text-white">{access.userName}</span>.
              {access.hasAllAccess
                ? ' Track every constituency, upload pipeline, and voter estimate in one place.'
                : singleConstituency
                  ? ` Everything here is scoped to ${singleConstituency.halkaName}.`
                  : ' Your view is limited to your assigned constituency.'}
            </p>
          </div>
          {access.isAdmin && (
            <span className="inline-flex items-center rounded-full bg-white/20 px-4 py-1.5 text-xs font-bold uppercase tracking-wider backdrop-blur-sm ring-1 ring-white/30">
              Admin
            </span>
          )}
        </div>
        {summary.pagesTotal > 0 && (
          <div className="relative mt-6 max-w-md">
            <div className="flex justify-between text-xs font-medium text-indigo-100">
              <span>Overall processing</span>
              <span>{overallPct}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-300 to-cyan-300 transition-all duration-700"
                style={{ width: `${overallPct}%` }}
              />
            </div>
          </div>
        )}
      </MotionDiv>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card, index) => {
          const theme = CARD_THEMES[index % CARD_THEMES.length];
          return (
            <MotionDiv
              key={card.name}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: index * 0.06 }}
              className={`overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-md ${theme.glow} transition hover:-translate-y-0.5 hover:shadow-lg`}
            >
              <div className={`h-1 bg-gradient-to-r ${theme.gradient}`} />
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className={`rounded-xl p-2.5 ${theme.iconBg}`}>
                    <card.icon className="h-6 w-6" />
                  </div>
                </div>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {card.name}
                </p>
                <p className="mt-1 truncate text-2xl font-bold tracking-tight text-slate-900">
                  {card.value}
                </p>
                <p className="mt-2 text-xs text-slate-500">{card.hint}</p>
              </div>
            </MotionDiv>
          );
        })}
      </div>

      {singleConstituency && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <MotionDiv
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="lg:col-span-2"
          >
            <ConstituencyCard constituency={singleConstituency} accentIndex={0} />
          </MotionDiv>
          <MotionDiv
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.08 }}
          >
            <VoterBreakdownPanel constituency={singleConstituency} />
          </MotionDiv>
        </div>
      )}

      {access.hasAllAccess && constituencies.length > 0 && (
        <>
          <MotionDiv
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm"
          >
            <h3 className="text-base font-bold text-slate-900">Pipeline at a glance</h3>
            <p className="mt-1 text-sm text-slate-500">Live processing totals across all constituencies</p>
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {[
                {
                  label: 'Completed',
                  value: summary.pagesCompleted,
                  icon: CheckCircleIcon,
                  bg: 'bg-gradient-to-br from-emerald-50 to-teal-50',
                  iconColor: 'text-emerald-600',
                  valueColor: 'text-emerald-700',
                },
                {
                  label: 'In flight',
                  value: summary.pagesProcessing,
                  icon: DocumentTextIcon,
                  bg: 'bg-gradient-to-br from-amber-50 to-orange-50',
                  iconColor: 'text-amber-600',
                  valueColor: 'text-amber-700',
                },
                {
                  label: 'Errors',
                  value: summary.pagesError,
                  icon: ExclamationCircleIcon,
                  bg: 'bg-gradient-to-br from-rose-50 to-red-50',
                  iconColor: 'text-rose-600',
                  valueColor: 'text-rose-700',
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className={`flex items-center gap-4 rounded-2xl p-4 ring-1 ring-inset ring-black/5 ${item.bg}`}
                >
                  <div className="rounded-xl bg-white/80 p-2.5 shadow-sm">
                    <item.icon className={`h-6 w-6 ${item.iconColor}`} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {item.label}
                    </p>
                    <p className={`text-2xl font-bold tabular-nums ${item.valueColor}`}>
                      {formatNumber(item.value)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </MotionDiv>

          <div>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">All constituencies</h2>
                <p className="text-sm text-slate-500">{constituencies.length} constituencies in view</p>
              </div>
              <Link
                href="/dashboard/constituency"
                className="inline-flex items-center gap-1 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500"
              >
                Manage
                <ArrowRightIcon className="h-4 w-4" />
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              {constituencies.map((constituency, index) => (
                <MotionDiv
                  key={constituency._id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: index * 0.04 }}
                >
                  <ConstituencyCard constituency={constituency} accentIndex={index} />
                </MotionDiv>
              ))}
            </div>
          </div>
        </>
      )}

      {constituencies.length === 0 && (
        <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 px-5 py-6 text-sm text-amber-900">
          No constituencies are available for your account. Contact an administrator if you need access.
        </div>
      )}

      <MotionDiv
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15 }}
      >
        <h3 className="text-base font-bold text-slate-900">Quick links</h3>
        <p className="mt-1 text-sm text-slate-500">Jump straight to common tasks</p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {quickLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${link.bg}`}
            >
              <div className={`inline-flex rounded-xl bg-gradient-to-r p-2.5 text-white shadow-sm ${link.gradient}`}>
                <link.icon className="h-5 w-5" />
              </div>
              <p className="mt-4 font-bold text-slate-900 group-hover:text-indigo-700">{link.label}</p>
              <p className="mt-1 text-sm text-slate-600">{link.desc}</p>
              <ArrowRightIcon className="absolute bottom-5 right-5 h-5 w-5 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-500" />
            </Link>
          ))}
        </div>
      </MotionDiv>
    </div>
  );
}
