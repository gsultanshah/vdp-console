'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ArrowPathIcon,
  ChartBarIcon,
  DocumentDuplicateIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';
import type { BlockCodeContext } from '@/lib/blockcode-hub';

interface BlockCodeOverviewTabProps {
  context: BlockCodeContext;
  onRefresh?: () => void;
}

interface VoterStats {
  count: number;
  male: number;
  female: number;
}

interface UploadStats {
  total: number;
  byStatus: Record<string, number>;
  byTag: Record<string, number>;
}

interface EstimateStats {
  totalFiles: number;
  estimatedVoters: number;
}

function StatCard({
  label,
  value,
  loading,
  sub,
}: {
  label: string;
  value: string | number;
  loading?: boolean;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      {loading ? (
        <div className="mt-2 h-8 w-20 animate-pulse rounded bg-gray-200" />
      ) : (
        <p className="mt-2 text-2xl font-semibold text-gray-900">{value}</p>
      )}
      {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

export default function BlockCodeOverviewTab({ context, onRefresh }: BlockCodeOverviewTabProps) {
  const { blockCode, halkaName } = context;
  const [voterStats, setVoterStats] = useState<VoterStats | null>(null);
  const [uploadStats, setUploadStats] = useState<UploadStats | null>(null);
  const [estimate, setEstimate] = useState<EstimateStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [voterRes, uploadRes] = await Promise.all([
        fetch(
          `/api/voters/count/?blockCode=${encodeURIComponent(blockCode)}&halkaName=${encodeURIComponent(halkaName)}`
        ),
        fetch(
          `/api/blockcodes/?blockCode=${encodeURIComponent(blockCode)}&page=1&limit=1&lite=true`
        ),
      ]);

      if (!voterRes.ok) throw new Error('Failed to load voter stats');
      const voterData: VoterStats = await voterRes.json();
      setVoterStats(voterData);

      if (uploadRes.ok) {
        const uploadData = await uploadRes.json();
        const total = uploadData.total ?? 0;
        setUploadStats({ total, byStatus: {}, byTag: {} });

        if (total > 0 && total <= 500) {
          const allRes = await fetch(
            `/api/blockcodes/?blockCode=${encodeURIComponent(blockCode)}&lite=true`
          );
          if (allRes.ok) {
            const pages: Array<{ status?: string; tag?: string }> = await allRes.json();
            const byStatus: Record<string, number> = {};
            const byTag: Record<string, number> = {};
            for (const page of pages) {
              const status = page.status ?? 'unknown';
              const tag = page.tag ?? 'unknown';
              byStatus[status] = (byStatus[status] ?? 0) + 1;
              byTag[tag] = (byTag[tag] ?? 0) + 1;
            }
            setUploadStats({ total: pages.length, byStatus, byTag });
            setEstimate({
              totalFiles: pages.length,
              estimatedVoters: pages.length * 28,
            });
          }
        } else if (total > 0) {
          setEstimate({ totalFiles: total, estimatedVoters: total * 28 });
          setUploadStats({ total, byStatus: {}, byTag: {} });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stats');
    } finally {
      setIsLoading(false);
    }
  }, [blockCode, halkaName]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const handleRefresh = () => {
    void loadStats();
    onRefresh?.();
  };

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm text-red-700">{error}</p>
        <button
          onClick={() => void loadStats()}
          className="mt-3 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Block overview</h2>
          <p className="text-sm text-gray-500">
            Real voter counts and uploaded page statistics for block {blockCode}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <ArrowPathIcon className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Registered voters"
          value={voterStats?.count.toLocaleString() ?? '—'}
          loading={isLoading}
          sub="Distinct CNICs"
        />
        <StatCard
          label="Male voters"
          value={voterStats?.male.toLocaleString() ?? '—'}
          loading={isLoading}
        />
        <StatCard
          label="Female voters"
          value={voterStats?.female.toLocaleString() ?? '—'}
          loading={isLoading}
        />
        <StatCard
          label="Uploaded pages"
          value={uploadStats?.total.toLocaleString() ?? '—'}
          loading={isLoading}
          sub={estimate ? `~${estimate.estimatedVoters.toLocaleString()} estimated voters` : undefined}
        />
      </div>

      {uploadStats && uploadStats.total > 0 && Object.keys(uploadStats.byStatus).length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
              <ChartBarIcon className="h-5 w-5 text-indigo-600" />
              Pages by status
            </div>
            <dl className="mt-3 space-y-2">
              {Object.entries(uploadStats.byStatus).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between text-sm">
                  <dt className="capitalize text-gray-600">{status}</dt>
                  <dd className="font-medium text-gray-900">{count.toLocaleString()}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
              <DocumentDuplicateIcon className="h-5 w-5 text-emerald-600" />
              Pages by tag
            </div>
            <dl className="mt-3 space-y-2">
              {Object.entries(uploadStats.byTag).map(([tag, count]) => (
                <div key={tag} className="flex items-center justify-between text-sm">
                  <dt className="capitalize text-gray-600">{tag}</dt>
                  <dd className="font-medium text-gray-900">{count.toLocaleString()}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}

      {voterStats && uploadStats && (
        <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-4">
          <div className="flex items-start gap-3">
            <UserGroupIcon className="mt-0.5 h-5 w-5 text-indigo-600" />
            <div className="text-sm text-indigo-900">
              <p className="font-medium">Coverage</p>
              <p className="mt-1 text-indigo-800">
                {voterStats.count.toLocaleString()} voters extracted from {uploadStats.total.toLocaleString()} uploaded
                pages
                {estimate && estimate.estimatedVoters > 0 && (
                  <> ({Math.round((voterStats.count / estimate.estimatedVoters) * 100)}% of ~{estimate.estimatedVoters.toLocaleString()} estimate)</>
                )}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
