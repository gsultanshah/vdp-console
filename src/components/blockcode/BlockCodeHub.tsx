'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { constituencyHomePath, CONSTITUENCY_INDEX_PATH } from '@/lib/constituency-path';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeftIcon,
  ArrowDownTrayIcon,
  ChartBarSquareIcon,
  Cog6ToothIcon,
  DocumentTextIcon,
  MagnifyingGlassIcon,
  PhotoIcon,
  UserGroupIcon,
  ArrowUpTrayIcon,
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
import BlockCodeExportTab from '@/components/blockcode/BlockCodeExportTab';
import BlockCodeParchiTab from '@/components/blockcode/BlockCodeParchiTab';
import BlockCodeJumpSelect from '@/components/blockcode/BlockCodeJumpSelect';

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
  const halkaNameFromUrl = searchParams.get('halkaName') ?? initialHalkaName ?? '';
  const tabFromUrl = searchParams.get('tab');
  const [context, setContext] = useState<BlockCodeContext | null>(null);
  const [activeTab, setActiveTab] = useState<BlockCodeTab>(initialTab);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const loadContext = async () => {
      try {
        const params = new URLSearchParams({ blockCode });
        if (halkaNameFromUrl) params.set('halkaName', halkaNameFromUrl);

        const response = await fetch(`/api/blockcodes/context/?${params.toString()}`);
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to load block code');
        }

        const data: BlockCodeContext = await response.json();
        if (!cancelled) {
          setContext(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load block code');
          setContext(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadContext();

    return () => {
      cancelled = true;
    };
  }, [blockCode, halkaNameFromUrl]);

  useEffect(() => {
    setActiveTab(parseBlockCodeTab(tabFromUrl));
  }, [tabFromUrl]);

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
          href={context?.halkaName ? constituencyHomePath(context.halkaName) : CONSTITUENCY_INDEX_PATH}
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
            href={context.halkaName ? constituencyHomePath(context.halkaName) : CONSTITUENCY_INDEX_PATH}
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
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:items-end">
          {context.blockCodes && context.blockCodes.length > 0 && (
            <BlockCodeJumpSelect
              blockCodes={context.blockCodes}
              currentBlockCode={context.blockCode}
              halkaName={context.halkaName}
              activeTab={activeTab}
            />
          )}
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
          <TabsTrigger value="export" className="gap-1.5">
            <ArrowDownTrayIcon className="h-4 w-4" />
            Export
          </TabsTrigger>
          <TabsTrigger value="parchi" className="gap-1.5">
            <DocumentTextIcon className="h-4 w-4" />
            Parchi
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <BlockCodeOverviewTab key={refreshKey} context={context} onRefresh={bumpRefresh} />
        </TabsContent>
        <TabsContent value="search" className="mt-6">
          <BlockCodeSearchTab context={context} />
        </TabsContent>
        <TabsContent value="pages" className="mt-6">
          {activeTab === 'pages' && (
            <BlockCodePagesTab key={`pages-${refreshKey}`} context={context} />
          )}
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
        <TabsContent value="export" className="mt-6">
          <BlockCodeExportTab context={context} />
        </TabsContent>
        <TabsContent value="parchi" className="mt-6">
          <BlockCodeParchiTab context={context} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
