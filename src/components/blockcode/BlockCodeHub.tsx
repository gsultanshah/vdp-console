'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeftIcon,
  ChartBarSquareIcon,
  MagnifyingGlassIcon,
  PhotoIcon,
  UserGroupIcon,
  ArrowUpTrayIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { BlockCodeContext, BlockCodeTab } from '@/lib/blockcode-hub';
import { blockCodeHubPath, parseBlockCodeTab } from '@/lib/blockcode-hub';
import BlockCodeOverviewTab from '@/components/blockcode/BlockCodeOverviewTab';
import BlockCodeSearchTab from '@/components/blockcode/BlockCodeSearchTab';
import BlockCodePagesTab from '@/components/blockcode/BlockCodePagesTab';
import BlockCodeVotersTab from '@/components/blockcode/BlockCodeVotersTab';
import BlockCodeUploadTab from '@/components/blockcode/BlockCodeUploadTab';
import BlockCodeProcessTab from '@/components/blockcode/BlockCodeProcessTab';

interface BlockCodeHubProps {
  blockCode: string;
  initialHalkaName?: string;
  initialTab?: BlockCodeTab;
}

export default function BlockCodeHub({
  blockCode,
  initialHalkaName,
  initialTab = 'overview',
}: BlockCodeHubProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [context, setContext] = useState<BlockCodeContext | null>(null);
  const [activeTab, setActiveTab] = useState<BlockCodeTab>(initialTab);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadContext = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ blockCode });
      const halkaFromUrl = initialHalkaName ?? searchParams.get('halkaName');
      if (halkaFromUrl) params.set('halkaName', halkaFromUrl);

      const response = await fetch(`/api/blockcodes/context/?${params.toString()}`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load block code');
      }
      const data: BlockCodeContext = await response.json();
      setContext(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load block code');
      setContext(null);
    } finally {
      setIsLoading(false);
    }
  }, [blockCode, initialHalkaName, searchParams]);

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  useEffect(() => {
    setActiveTab(parseBlockCodeTab(searchParams.get('tab')));
  }, [searchParams]);

  const handleTabChange = (value: string) => {
    const tab = parseBlockCodeTab(value);
    setActiveTab(tab);
    if (!context) return;
    router.replace(blockCodeHubPath(blockCode, context.halkaName, tab), { scroll: false });
  };

  const bumpRefresh = () => setRefreshKey((value) => value + 1);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
        <div className="h-64 animate-pulse rounded-lg bg-gray-100" />
      </div>
    );
  }

  if (error || !context) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-8 text-center">
        <p className="text-sm text-red-700">{error ?? 'Block code not found'}</p>
        <Link
          href="/dashboard/constituency/"
          className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-800"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to constituencies
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/dashboard/constituency/"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Constituencies
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">Block {context.blockCode}</h1>
          <p className="mt-1 text-sm text-gray-600">
            {context.constituencyLabel ?? context.halkaName}
            {context.constituencyStatus === 'inactive' && (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                Inactive
              </span>
            )}
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-gray-100 p-1">
          <TabsTrigger value="overview" className="gap-1.5">
            <ChartBarSquareIcon className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="search" className="gap-1.5">
            <MagnifyingGlassIcon className="h-4 w-4" />
            Search
          </TabsTrigger>
          <TabsTrigger value="pages" className="gap-1.5">
            <PhotoIcon className="h-4 w-4" />
            Pages
          </TabsTrigger>
          <TabsTrigger value="voters" className="gap-1.5">
            <UserGroupIcon className="h-4 w-4" />
            Voters
          </TabsTrigger>
          <TabsTrigger value="upload" className="gap-1.5">
            <ArrowUpTrayIcon className="h-4 w-4" />
            Upload
          </TabsTrigger>
          <TabsTrigger value="process" className="gap-1.5">
            <Cog6ToothIcon className="h-4 w-4" />
            Process
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <BlockCodeOverviewTab key={refreshKey} context={context} onRefresh={bumpRefresh} />
        </TabsContent>
        <TabsContent value="search" className="mt-6">
          <BlockCodeSearchTab context={context} />
        </TabsContent>
        <TabsContent value="pages" className="mt-6">
          <BlockCodePagesTab key={`pages-${refreshKey}`} context={context} />
        </TabsContent>
        <TabsContent value="voters" className="mt-6">
          <BlockCodeVotersTab key={`voters-${refreshKey}`} context={context} />
        </TabsContent>
        <TabsContent value="upload" className="mt-6">
          <BlockCodeUploadTab context={context} onUploaded={bumpRefresh} />
        </TabsContent>
        <TabsContent value="process" className="mt-6">
          <BlockCodeProcessTab context={context} onProcessed={bumpRefresh} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
