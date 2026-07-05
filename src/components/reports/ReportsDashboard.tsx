'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowPathIcon,
  ArrowTrendingUpIcon,
  ChartPieIcon,
  DocumentDuplicateIcon,
  MapIcon,
  UserGroupIcon,
  ClipboardDocumentCheckIcon,
} from '@heroicons/react/24/outline';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { MotionDiv } from '@/components/ui/Motion';
import ReportsDataTable, { exportTableCsv, type ReportsTableColumn } from '@/components/reports/ReportsDataTable';
import { BlockWorkStatusBadge } from '@/components/constituency/BlockCodeWorkProgressChart';
import { constituencyHomePath } from '@/lib/constituency-path';
import {
  GENDER_COLORS,
  PAGE_STATUS_COLORS,
  REPORTS_TABS,
  WORK_STATUS_COLORS,
  type ReportsBlockCodeRow,
  type ReportsConstituencyRow,
  type ReportsGlobalStats,
  type ReportsOverviewResponse,
  type ReportsScope,
  type ReportsSummary,
  type ReportsTabId,
} from '@/lib/reports-types';
import type { BlockWorkStatus } from '@/lib/block-work-progress';
import {
  streamReportsBlockCodes,
  streamReportsOverview,
} from '@/lib/reports-stream-client';

function formatNumber(value: number): string {
  return value.toLocaleString();
}

function pct(part: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.round((part / total) * 100);
}

function recordToChartData(
  record: Record<string, number>,
  colorMap: Record<string, string>,
  labelFormatter?: (key: string) => string
) {
  return Object.entries(record)
    .filter(([, value]) => value > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([name, value]) => ({
      name: labelFormatter ? labelFormatter(name) : name.charAt(0).toUpperCase() + name.slice(1),
      value,
      fill: colorMap[name] ?? '#64748b',
    }));
}

function ChartCard({
  title,
  subtitle,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm ${className}`}
    >
      <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br from-indigo-50 to-violet-50 blur-2xl" />
      <div className="relative">
        <h3 className="font-bold text-slate-900">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
        <div className="mt-4 h-72">{children}</div>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  gradient,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: typeof UserGroupIcon;
  gradient: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/20 bg-white/10 p-5 backdrop-blur-md">
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${gradient}`} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-100">{label}</p>
          <p className="mt-2 text-3xl font-bold text-white">{value}</p>
          {sub ? <p className="mt-1 text-xs text-indigo-100/80">{sub}</p> : null}
        </div>
        <div className={`rounded-xl bg-gradient-to-br p-2.5 text-white shadow-lg ${gradient}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color?: string }>;
  label?: string;
}) => {
  if (!active || !payload?.length) {
    return null;
  }
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-lg">
      {label ? <p className="mb-1 font-semibold text-slate-900">{label}</p> : null}
      {payload.map((entry) => (
        <p key={entry.name} className="text-slate-600">
          <span className="font-medium text-slate-900">{entry.name}:</span>{' '}
          {formatNumber(entry.value)}
        </p>
      ))}
    </div>
  );
};

function BlockStreamNotice({
  loading,
  done,
  count,
  total,
}: {
  loading: boolean;
  done: boolean;
  count: number;
  total: number;
}) {
  if (done) {
    return null;
  }

  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/80 px-4 py-3 text-sm text-indigo-900">
      {loading ? (
        <span>
          Loading block details… {count > 0 ? `${count.toLocaleString()} loaded` : 'Starting…'}
          {total > 0 ? ` of ${total.toLocaleString()}` : ''}
        </span>
      ) : (
        <span>Open this tab to load block-level voter and page data on demand.</span>
      )}
    </div>
  );
}

function ConstituencyScopeBar({
  available,
  selected,
  onSelect,
  disabled,
}: {
  available: string[];
  selected: string;
  onSelect: (value: string) => void;
  disabled?: boolean;
}) {
  if (available.length <= 1) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Constituency scope</p>
          <p className="text-xs text-slate-500">
            {selected === 'all'
              ? 'Combined reports across all constituencies you can access'
              : `Reports filtered to ${selected} only`}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSelect('all')}
          className={`rounded-full px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${
            selected === 'all'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          All constituencies
        </button>
        {available.map((halkaName) => (
          <button
            key={halkaName}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(halkaName)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${
              selected === halkaName
                ? 'bg-violet-600 text-white shadow-md shadow-violet-200'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {halkaName}
          </button>
        ))}
      </div>
    </div>
  );
}

const BLOCK_DATA_TABS: ReportsTabId[] = ['block-codes', 'voters', 'pages', 'work-progress'];

export default function ReportsDashboard() {
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [scope, setScope] = useState<ReportsScope | null>(null);
  const [summary, setSummary] = useState<ReportsSummary | null>(null);
  const [globalStats, setGlobalStats] = useState<ReportsGlobalStats | null>(null);
  const [constituencies, setConstituencies] = useState<ReportsConstituencyRow[]>([]);
  const [blockCodes, setBlockCodes] = useState<ReportsBlockCodeRow[]>([]);
  const [hasSummary, setHasSummary] = useState(false);
  const [overviewDone, setOverviewDone] = useState(false);
  const [blocksLoading, setBlocksLoading] = useState(false);
  const [blocksDone, setBlocksDone] = useState(false);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<ReportsTabId>('overview');
  const [availableConstituencies, setAvailableConstituencies] = useState<string[]>([]);
  const [selectedConstituency, setSelectedConstituency] = useState<string>('all');
  const abortRef = useRef<AbortController | null>(null);
  const blockAbortRef = useRef<AbortController | null>(null);

  const isAllConstituencies = selectedConstituency === 'all';
  const activeHalkaName = isAllConstituencies ? undefined : selectedConstituency;

  const data = useMemo((): ReportsOverviewResponse | null => {
    if (!summary || !globalStats || !scope || !generatedAt) {
      return null;
    }
    return {
      generatedAt,
      scope,
      summary,
      global: globalStats,
      constituencies,
      blockCodes,
    };
  }, [generatedAt, scope, summary, globalStats, constituencies, blockCodes]);

  const loadBlockCodes = useCallback(async () => {
    if (blocksLoading || blocksDone) {
      return;
    }

    blockAbortRef.current?.abort();
    const controller = new AbortController();
    blockAbortRef.current = controller;
    setBlocksLoading(true);
    setProgressMessage('Loading block code details…');

    try {
      await streamReportsBlockCodes(
        {
          onProgress: (event) => setProgressMessage(event.message),
          onBlockCode: (event) => {
            setBlockCodes((current) => [...current, event.row]);
          },
          onError: (message) => setLoadError(message),
          onDone: () => {
            setBlocksDone(true);
            setProgressMessage(null);
          },
        },
        { halkaName: activeHalkaName, signal: controller.signal }
      );
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      setLoadError(error instanceof Error ? error.message : 'Failed to load block codes');
    } finally {
      setBlocksLoading(false);
    }
  }, [activeHalkaName, blocksDone, blocksLoading]);

  const loadReports = useCallback(async (constituency: string) => {
    abortRef.current?.abort();
    blockAbortRef.current?.abort();

    const controller = new AbortController();
    abortRef.current = controller;

    setIsRefreshing(true);
    setLoadError(null);
    setHasSummary(false);
    setOverviewDone(false);
    setBlocksDone(false);
    setBlocksLoading(false);
    setGeneratedAt(null);
    setScope(null);
    setSummary(null);
    setGlobalStats(null);
    setConstituencies([]);
    setBlockCodes([]);
    setProgressMessage(
      constituency === 'all' ? 'Loading all constituencies…' : `Loading ${constituency}…`
    );

    const halkaName = constituency === 'all' ? undefined : constituency;

    try {
      await streamReportsOverview(
        {
          onMeta: (event) => {
            setGeneratedAt(event.generatedAt);
            setScope(event.scope);
            setAvailableConstituencies(event.availableConstituencies);
          },
          onSummary: (event) => {
            setSummary(event.summary);
            setGlobalStats(event.global);
            setHasSummary(true);
            setProgressMessage('Counting voters…');
          },
          onVoters: (event) => {
            setSummary((current) =>
              current
                ? {
                    ...current,
                    voters: event.voters,
                  }
                : current
            );
            setGlobalStats((current) =>
              current
                ? {
                    ...current,
                    votersByGender: event.voters,
                    workByStatus: event.workByStatus,
                  }
                : current
            );
            setProgressMessage('Loading constituencies…');
          },
          onConstituency: (row) => {
            setConstituencies((current) => [...current, row]);
          },
          onProgress: (event) => setProgressMessage(event.message),
          onDone: () => {
            setOverviewDone(true);
            setProgressMessage(null);
          },
          onError: (message) => setLoadError(message),
        },
        { halkaName, signal: controller.signal }
      );
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      setLoadError(error instanceof Error ? error.message : 'Failed to load reports');
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadReports(selectedConstituency);
    return () => {
      abortRef.current?.abort();
      blockAbortRef.current?.abort();
    };
  }, [selectedConstituency, loadReports]);

  const handleConstituencySelect = (value: string) => {
    if (value === selectedConstituency) {
      return;
    }
    setSelectedConstituency(value);
  };

  useEffect(() => {
    if (!overviewDone) {
      return;
    }

    const needsBlocks =
      BLOCK_DATA_TABS.includes(activeTab) || !isAllConstituencies;

    if (!needsBlocks) {
      return;
    }

    if (!blocksDone && !blocksLoading && blockCodes.length === 0) {
      void loadBlockCodes();
    }
  }, [
    activeTab,
    overviewDone,
    blocksDone,
    blocksLoading,
    blockCodes.length,
    loadBlockCodes,
    isAllConstituencies,
  ]);

  const genderChartData = useMemo(() => {
    if (!globalStats) {
      return [];
    }
    return [
      { name: 'Male', value: globalStats.votersByGender.male, fill: GENDER_COLORS.male },
      { name: 'Female', value: globalStats.votersByGender.female, fill: GENDER_COLORS.female },
    ];
  }, [globalStats]);

  const constituencyVoterChart = useMemo(() => {
    if (!isAllConstituencies && blockCodes.length > 0) {
      return blockCodes
        .slice()
        .sort((a, b) => b.voters.count - a.voters.count)
        .slice(0, 15)
        .map((row) => ({
          name: row.blockCode,
          male: row.voters.male,
          female: row.voters.female,
          total: row.voters.count,
        }));
    }

    return constituencies
      .slice()
      .sort((a, b) => b.voters.count - a.voters.count)
      .slice(0, 12)
      .map((row) => ({
        name: row.halkaName,
        male: row.voters.male,
        female: row.voters.female,
        total: row.voters.count,
      }));
  }, [constituencies, blockCodes, isAllConstituencies]);

  const constituencyColumns: ReportsTableColumn<ReportsConstituencyRow>[] = [
    {
      key: 'halkaName',
      label: 'Constituency',
      sortable: true,
      sortValue: (row) => row.halkaName,
      exportValue: (row) => row.halkaName,
      render: (row) => (
        <Link href={constituencyHomePath(row.halkaName)} className="font-medium text-indigo-600 hover:underline">
          {row.halkaName}
        </Link>
      ),
    },
    {
      key: 'blockCodes',
      label: 'Blocks',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.blockCodeCount,
      exportValue: (row) => row.blockCodeCount,
      render: (row) => formatNumber(row.blockCodeCount),
    },
    {
      key: 'voters',
      label: 'Voters',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.voters.count,
      exportValue: (row) => row.voters.count,
      render: (row) => formatNumber(row.voters.count),
    },
    {
      key: 'male',
      label: 'Male',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.voters.male,
      exportValue: (row) => row.voters.male,
      render: (row) => formatNumber(row.voters.male),
    },
    {
      key: 'female',
      label: 'Female',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.voters.female,
      exportValue: (row) => row.voters.female,
      render: (row) => formatNumber(row.voters.female),
    },
    {
      key: 'pages',
      label: 'Pages',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.pages.total,
      exportValue: (row) => row.pages.total,
      render: (row) => formatNumber(row.pages.total),
    },
    {
      key: 'completed',
      label: 'Completed',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.pages.completed,
      exportValue: (row) => row.pages.completed,
      render: (row) => (
        <span className="font-medium text-emerald-700">{formatNumber(row.pages.completed)}</span>
      ),
    },
    {
      key: 'workDone',
      label: 'Work done',
      align: 'right',
      sortable: true,
      sortValue: (row) => (row.workProgress.completed ?? 0) + (row.workProgress.verified ?? 0),
      exportValue: (row) => (row.workProgress.completed ?? 0) + (row.workProgress.verified ?? 0),
      render: (row) => {
        const done = (row.workProgress.completed ?? 0) + (row.workProgress.verified ?? 0);
        return `${formatNumber(done)} / ${formatNumber(row.blockCodeCount)}`;
      },
    },
  ];

  const blockCodeColumns: ReportsTableColumn<ReportsBlockCodeRow>[] = [
    {
      key: 'halkaName',
      label: 'Constituency',
      sortable: true,
      sortValue: (row) => row.halkaName,
      exportValue: (row) => row.halkaName,
      render: (row) => row.halkaName,
    },
    {
      key: 'blockCode',
      label: 'Block',
      sortable: true,
      sortValue: (row) => row.blockCode,
      exportValue: (row) => row.blockCode,
      render: (row) => <span className="font-semibold text-slate-900">{row.blockCode}</span>,
    },
    {
      key: 'voters',
      label: 'Voters',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.voters.count,
      exportValue: (row) => row.voters.count,
      render: (row) => formatNumber(row.voters.count),
    },
    {
      key: 'male',
      label: 'Male',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.voters.male,
      exportValue: (row) => row.voters.male,
      render: (row) => formatNumber(row.voters.male),
    },
    {
      key: 'female',
      label: 'Female',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.voters.female,
      exportValue: (row) => row.voters.female,
      render: (row) => formatNumber(row.voters.female),
    },
    {
      key: 'pages',
      label: 'Pages',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.pages,
      exportValue: (row) => row.pages,
      render: (row) => formatNumber(row.pages),
    },
    {
      key: 'pagesCompleted',
      label: 'Completed',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.pagesCompleted,
      exportValue: (row) => row.pagesCompleted,
      render: (row) => formatNumber(row.pagesCompleted),
    },
    {
      key: 'pagesError',
      label: 'Errors',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.pagesError,
      exportValue: (row) => row.pagesError,
      render: (row) =>
        row.pagesError > 0 ? (
          <span className="font-medium text-rose-600">{formatNumber(row.pagesError)}</span>
        ) : (
          '0'
        ),
    },
    {
      key: 'workStatus',
      label: 'Work status',
      sortable: true,
      sortValue: (row) => row.workStatus,
      exportValue: (row) => row.workStatus,
      render: (row) => (
        <BlockWorkStatusBadge status={row.workStatus as BlockWorkStatus} />
      ),
    },
  ];

  if (loadError) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center">
        <p className="font-semibold text-rose-900">{loadError}</p>
        <button
          type="button"
          onClick={() => void loadReports(selectedConstituency)}
          className="mt-4 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-violet-900 px-6 py-8 shadow-2xl sm:px-10 sm:py-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(99,102,241,0.35),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(168,85,247,0.25),transparent_40%),radial-gradient(circle_at_50%_100%,rgba(14,165,233,0.15),transparent_50%)]" />
        <div className="relative">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-indigo-200">Analytics & insights</p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Reports
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-indigo-100/90">
                {isAllConstituencies
                  ? 'Combined analytics across all constituencies you can access.'
                  : `Detailed analytics for constituency ${selectedConstituency}.`}
              </p>
              {generatedAt ? (
                <p className="mt-3 text-xs text-indigo-200/70">
                  Generated {new Date(generatedAt).toLocaleString()}
                  {isAllConstituencies
                    ? ` · ${availableConstituencies.length} constituencies`
                    : ` · ${selectedConstituency} only`}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => void loadReports(selectedConstituency)}
              disabled={isRefreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-medium text-white backdrop-blur hover:bg-white/20 disabled:opacity-50"
            >
              <ArrowPathIcon className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {progressMessage ? (
            <p className="mt-4 text-sm text-indigo-200/90">{progressMessage}</p>
          ) : null}

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Registered voters"
              value={!hasSummary ? '…' : formatNumber(summary?.voters.count ?? 0)}
              sub={
                summary && summary.voters.male + summary.voters.female > 0
                  ? `${formatNumber(summary.voters.male)} M · ${formatNumber(summary.voters.female)} F`
                  : hasSummary
                    ? 'Counting gender split…'
                    : undefined
              }
              icon={UserGroupIcon}
              gradient="from-indigo-500 to-violet-600"
            />
            <KpiCard
              label="Block codes"
              value={!hasSummary ? '…' : formatNumber(summary?.blockCodes ?? 0)}
              sub={
                summary
                  ? `${formatNumber(summary.constituencies)} constituencies`
                  : undefined
              }
              icon={MapIcon}
              gradient="from-sky-500 to-cyan-600"
            />
            <KpiCard
              label="Uploaded pages"
              value={!hasSummary ? '…' : formatNumber(summary?.pages.total ?? 0)}
              sub={
                summary
                  ? `${pct(summary.pages.completed, summary.pages.total)}% completed`
                  : undefined
              }
              icon={DocumentDuplicateIcon}
              gradient="from-emerald-500 to-teal-600"
            />
            <KpiCard
              label="Manual work"
              value={!hasSummary ? '…' : `${summary?.workProgress.completionPercent ?? 0}%`}
              sub={
                summary
                  ? `${formatNumber((summary.workProgress.byStatus.completed ?? 0) + (summary.workProgress.byStatus.verified ?? 0))} blocks done`
                  : undefined
              }
              icon={ClipboardDocumentCheckIcon}
              gradient="from-amber-500 to-orange-600"
            />
          </div>
        </div>
      </div>

      <ConstituencyScopeBar
        available={availableConstituencies}
        selected={selectedConstituency}
        onSelect={handleConstituencySelect}
        disabled={isRefreshing}
      />

      {/* Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {REPORTS_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                activeTab === tab.id
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                  : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <p className="-mt-4 text-sm text-slate-500">
        {REPORTS_TABS.find((tab) => tab.id === activeTab)?.description}
      </p>

      {isRefreshing && !hasSummary ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-80 animate-pulse rounded-2xl bg-slate-200" />
          ))}
        </div>
      ) : hasSummary && globalStats && summary ? (
        <MotionDiv
          key={activeTab}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="space-y-6"
        >
          {activeTab === 'overview' && (
            <>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
                <ChartCard title="Voters by gender" subtitle="Distinct CNICs">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={genderChartData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={90}
                        paddingAngle={3}
                      >
                        {genderChartData.map((entry) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Pages by status" subtitle="Upload pipeline">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={recordToChartData(globalStats.pagesByStatus, PAGE_STATUS_COLORS)}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={95}
                        label={({ name, percent }) =>
                          `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                        }
                      >
                        {recordToChartData(globalStats.pagesByStatus, PAGE_STATUS_COLORS).map(
                          (entry) => (
                            <Cell key={entry.name} fill={entry.fill} />
                          )
                        )}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Work progress" subtitle="Manual QA statuses">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={recordToChartData(globalStats.workByStatus, WORK_STATUS_COLORS)}
                      layout="vertical"
                      margin={{ left: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis type="number" tickFormatter={(v) => formatNumber(Number(v))} />
                      <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                        {recordToChartData(globalStats.workByStatus, WORK_STATUS_COLORS).map(
                          (entry) => (
                            <Cell key={entry.name} fill={entry.fill} />
                          )
                        )}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <ChartCard
                  title={isAllConstituencies ? 'Top constituencies by voters' : 'Top blocks by voters'}
                  subtitle={isAllConstituencies ? 'Male vs female stacked' : selectedConstituency}
                  className="xl:col-span-2"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={constituencyVoterChart} margin={{ bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-25} textAnchor="end" height={60} />
                      <YAxis tickFormatter={(v) => formatNumber(Number(v))} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <Bar dataKey="male" stackId="a" fill={GENDER_COLORS.male} name="Male" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="female" stackId="a" fill={GENDER_COLORS.female} name="Female" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>

              <ReportsDataTable
                title={isAllConstituencies ? 'Constituency snapshot' : `${selectedConstituency} overview`}
                subtitle={
                  isAllConstituencies
                    ? 'Quick overview across all halkas'
                    : 'Summary for the selected constituency'
                }
                rows={constituencies}
                columns={constituencyColumns}
                searchFilter={(row, q) =>
                  row.halkaName.toLowerCase().includes(q)
                }
                searchPlaceholder="Filter constituencies…"
                onExport={() =>
                  exportTableCsv('constituencies-report.csv', constituencies, constituencyColumns)
                }
              />
            </>
          )}

          {activeTab === 'constituencies' && (
            <>
              <ChartCard title="Pages completed by constituency" subtitle="Top 15">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={constituencies
                      .slice()
                      .sort((a, b) => b.pages.completed - a.pages.completed)
                      .slice(0, 15)
                      .map((row) => ({
                        name: row.halkaName,
                        completed: row.pages.completed,
                        processing: row.pages.processing,
                        error: row.pages.error,
                      }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-25} textAnchor="end" height={60} />
                    <YAxis tickFormatter={(v) => formatNumber(Number(v))} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar dataKey="completed" fill="#10b981" name="Completed" stackId="s" />
                    <Bar dataKey="processing" fill="#f59e0b" name="Processing" stackId="s" />
                    <Bar dataKey="error" fill="#ef4444" name="Error" stackId="s" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ReportsDataTable
                title="All constituencies"
                rows={constituencies}
                columns={constituencyColumns}
                searchFilter={(row, q) => row.halkaName.toLowerCase().includes(q)}
                pageSize={50}
                onExport={() =>
                  exportTableCsv('constituencies-report.csv', constituencies, constituencyColumns)
                }
              />
            </>
          )}

          {activeTab === 'block-codes' && (
            <>
              <BlockStreamNotice
                loading={blocksLoading}
                done={blocksDone}
                count={blockCodes.length}
                total={summary?.blockCodes ?? 0}
              />
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <ChartCard title="Blocks by work status">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={recordToChartData(
                          blockCodes.reduce<Record<string, number>>((acc, row) => {
                            acc[row.workStatus] = (acc[row.workStatus] ?? 0) + 1;
                            return acc;
                          }, {}),
                          WORK_STATUS_COLORS
                        )}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={95}
                        label
                      >
                        {recordToChartData(
                          blockCodes.reduce<Record<string, number>>((acc, row) => {
                            acc[row.workStatus] = (acc[row.workStatus] ?? 0) + 1;
                            return acc;
                          }, {}),
                          WORK_STATUS_COLORS
                        ).map((entry) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Top blocks by voter count" subtitle="Top 15">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={blockCodes
                        .slice()
                        .sort((a, b) => b.voters.count - a.voters.count)
                        .slice(0, 15)
                        .map((row) => ({
                          name: `${row.halkaName}-${row.blockCode}`,
                          voters: row.voters.count,
                        }))}
                      layout="vertical"
                      margin={{ left: 10 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis type="number" tickFormatter={(v) => formatNumber(Number(v))} />
                      <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="voters" fill="#6366f1" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>

              <ReportsDataTable
                title="All block codes"
                subtitle={`${blockCodes.length.toLocaleString()} blocks`}
                rows={blockCodes}
                columns={blockCodeColumns}
                searchFilter={(row, q) =>
                  row.halkaName.toLowerCase().includes(q) ||
                  row.blockCode.toLowerCase().includes(q)
                }
                searchPlaceholder="Search block or constituency…"
                pageSize={50}
                onExport={() =>
                  exportTableCsv('block-codes-report.csv', blockCodes, blockCodeColumns)
                }
              />
            </>
          )}

          {activeTab === 'voters' && (
            <>
              <BlockStreamNotice
                loading={blocksLoading}
                done={blocksDone}
                count={blockCodes.length}
                total={summary?.blockCodes ?? 0}
              />
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <ChartCard title="Global gender split">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={genderChartData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label={({ name, value }) => `${name}: ${formatNumber(value ?? 0)}`}
                      >
                        {genderChartData.map((entry) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Gender ratio by constituency" subtitle="Top 12 by total voters">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={constituencyVoterChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={55} />
                      <YAxis tickFormatter={(v) => formatNumber(Number(v))} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <Bar dataKey="male" fill={GENDER_COLORS.male} name="Male" />
                      <Bar dataKey="female" fill={GENDER_COLORS.female} name="Female" />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>

              <ReportsDataTable
                title="Voters by constituency"
                rows={constituencies}
                columns={constituencyColumns.filter((col) =>
                  ['halkaName', 'voters', 'male', 'female', 'blockCodes'].includes(col.key)
                )}
                searchFilter={(row, q) => row.halkaName.toLowerCase().includes(q)}
                onExport={() =>
                  exportTableCsv(
                    'voters-by-constituency.csv',
                    constituencies,
                    constituencyColumns
                  )
                }
              />

              <ReportsDataTable
                title="Voters by block code"
                rows={blockCodes}
                columns={blockCodeColumns.filter((col) =>
                  ['halkaName', 'blockCode', 'voters', 'male', 'female'].includes(col.key)
                )}
                searchFilter={(row, q) =>
                  row.halkaName.toLowerCase().includes(q) ||
                  row.blockCode.toLowerCase().includes(q)
                }
                pageSize={50}
                onExport={() =>
                  exportTableCsv('voters-by-block.csv', blockCodes, blockCodeColumns)
                }
              />
            </>
          )}

          {activeTab === 'pages' && (
            <>
              <BlockStreamNotice
                loading={blocksLoading}
                done={blocksDone}
                count={blockCodes.length}
                total={summary?.blockCodes ?? 0}
              />
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <ChartCard title="Pages by processing status">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={recordToChartData(globalStats.pagesByStatus, PAGE_STATUS_COLORS)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" />
                      <YAxis tickFormatter={(v) => formatNumber(Number(v))} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                        {recordToChartData(globalStats.pagesByStatus, PAGE_STATUS_COLORS).map(
                          (entry) => (
                            <Cell key={entry.name} fill={entry.fill} />
                          )
                        )}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Pages by upload tag" subtitle="Gender / religion tags">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={recordToChartData(globalStats.pagesByTag, {
                        'muslim-male': '#6366f1',
                        'muslim-female': '#a855f7',
                        'qadiani-male': '#0ea5e9',
                        'qadiani-female': '#ec4899',
                        unknown: '#94a3b8',
                      })}
                      layout="vertical"
                      margin={{ left: 10 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis type="number" tickFormatter={(v) => formatNumber(Number(v))} />
                      <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="value" fill="#6366f1" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>

              <ReportsDataTable
                title="Pages by block code"
                rows={blockCodes}
                columns={blockCodeColumns.filter((col) =>
                  ['halkaName', 'blockCode', 'pages', 'pagesCompleted', 'pagesProcessing', 'pagesError'].includes(
                    col.key
                  )
                )}
                searchFilter={(row, q) =>
                  row.halkaName.toLowerCase().includes(q) ||
                  row.blockCode.toLowerCase().includes(q)
                }
                pageSize={50}
                onExport={() =>
                  exportTableCsv('pages-by-block.csv', blockCodes, blockCodeColumns)
                }
              />
            </>
          )}

          {activeTab === 'work-progress' && (
            <>
              <BlockStreamNotice
                loading={blocksLoading}
                done={blocksDone}
                count={blockCodes.length}
                total={summary?.blockCodes ?? 0}
              />
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <ChartCard title="Work status distribution" subtitle="All block codes">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={recordToChartData(globalStats.workByStatus, WORK_STATUS_COLORS)}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={95}
                        label
                      >
                        {recordToChartData(globalStats.workByStatus, WORK_STATUS_COLORS).map(
                          (entry) => (
                            <Cell key={entry.name} fill={entry.fill} />
                          )
                        )}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Completion progress">
                  <div className="flex h-full flex-col justify-center space-y-6 px-4">
                    <div>
                      <div className="flex justify-between text-sm">
                        <span className="font-medium text-slate-700">Completed + Verified</span>
                        <span className="font-bold text-emerald-700">
                          {summary.workProgress.completionPercent}%
                        </span>
                      </div>
                      <div className="mt-2 h-4 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-700"
                          style={{ width: `${summary.workProgress.completionPercent}%` }}
                        />
                      </div>
                    </div>
                    {recordToChartData(globalStats.workByStatus, WORK_STATUS_COLORS).map((row) => (
                      <div key={row.name}>
                        <div className="flex justify-between text-xs text-slate-600">
                          <span>{row.name}</span>
                          <span className="font-semibold">{formatNumber(row.value)}</span>
                        </div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${pct(row.value, summary.blockCodes)}%`,
                              backgroundColor: row.fill,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </ChartCard>
              </div>

              <ReportsDataTable
                title="Block codes by work status"
                rows={blockCodes}
                columns={blockCodeColumns}
                searchFilter={(row, q) =>
                  row.halkaName.toLowerCase().includes(q) ||
                  row.blockCode.toLowerCase().includes(q) ||
                  row.workStatus.toLowerCase().includes(q)
                }
                pageSize={50}
                onExport={() =>
                  exportTableCsv('work-progress-report.csv', blockCodes, blockCodeColumns)
                }
              />
            </>
          )}
        </MotionDiv>
      ) : null}

      {/* Footer insight strip */}
      {summary && hasSummary ? (
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 px-5 py-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-indigo-900">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <ArrowTrendingUpIcon className="h-4 w-4" />
              {pct(summary.pages.completed, summary.pages.total)}% pages processed
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ChartPieIcon className="h-4 w-4" />
              {pct(summary.voters.male, summary.voters.count)}% male voters
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ClipboardDocumentCheckIcon className="h-4 w-4" />
              {summary.workProgress.completionPercent}% manual QA complete
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
