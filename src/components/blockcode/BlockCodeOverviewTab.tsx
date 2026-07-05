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
  const [isLoadingVoters, setIsLoadingVoters] = useState(true);
  const [isLoadingUploads, setIsLoadingUploads] = useState(true);
  const [voterError, setVoterError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const loadVoterStats = useCallback(async () => {
    setIsLoadingVoters(true);
    setVoterError(null);
    try {
      const response = await fetch(
        `/api/voters/count/?blockCode=${encodeURIComponent(blockCode)}&halkaName=${encodeURIComponent(halkaName)}`
      );
      if (!response.ok) {
        throw new Error('Failed to load voter stats');
      }
      const data: VoterStats = await response.json();
      setVoterStats(data);
    } catch (err) {
      setVoterError(err instanceof Error ? err.message : 'Failed to load voter stats');
    } finally {
      setIsLoadingVoters(false);
    }
  }, [blockCode, halkaName]);

  const loadUploadStats = useCallback(async () => {
    setIsLoadingUploads(true);
    setUploadError(null);
    try {
      const params = new URLSearchParams({ blockCode, halkaName });
      const response = await fetch(`/api/blockcodes/count/?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to load page stats');
      }

      const data: UploadStats & { total: number } = await response.json();
      setUploadStats({
        total: data.total,
        byStatus: data.byStatus ?? {},
        byTag: data.byTag ?? {},
      });
      if (data.total > 0) {
        setEstimate({
          totalFiles: data.total,
          estimatedVoters: data.total * 28,
        });
      } else {
        setEstimate(null);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to load page stats');
    } finally {
      setIsLoadingUploads(false);
    }
  }, [blockCode, halkaName]);

  const loadStats = useCallback(async () => {
    await Promise.all([loadVoterStats(), loadUploadStats()]);
  }, [loadVoterStats, loadUploadStats]);

  useEffect(() => {
    void loadVoterStats();
    void loadUploadStats();
  }, [loadVoterStats, loadUploadStats]);

  const handleRefresh = () => {
    void loadStats();
    onRefresh?.();
  };

  const isRefreshing = isLoadingVoters || isLoadingUploads;

  if (voterError && !voterStats && uploadError && !uploadStats) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm text-red-700">{voterError}</p>
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
            Voter counts from distinct CNICs (male/female by last CNIC digit) for block {blockCode}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <ArrowPathIcon className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {voterError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {voterError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Registered voters"
          value={voterStats?.count.toLocaleString() ?? '—'}
          loading={isLoadingVoters}
          sub="Distinct CNICs"
        />
        <StatCard
          label="Male voters"
          value={voterStats?.male.toLocaleString() ?? '—'}
          loading={isLoadingVoters}
          sub="Last CNIC digit odd"
        />
        <StatCard
          label="Female voters"
          value={voterStats?.female.toLocaleString() ?? '—'}
          loading={isLoadingVoters}
          sub="Last CNIC digit even"
        />
        <StatCard
          label="Uploaded pages"
          value={uploadStats?.total.toLocaleString() ?? '—'}
          loading={isLoadingUploads}
          sub={estimate ? `~${estimate.estimatedVoters.toLocaleString()} estimated voters` : undefined}
        />
      </div>

      {uploadError && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {uploadError}
        </div>
      )}

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
