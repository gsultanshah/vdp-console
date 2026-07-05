import { Suspense } from 'react';
import BlockCodeHub from '@/components/blockcode/BlockCodeHub';
import { parseBlockCodeTab } from '@/lib/blockcode-hub';

interface BlockCodePageProps {
  params: { blockCode: string };
  searchParams: { halkaName?: string; tab?: string };
}

export default function BlockCodePage({ params, searchParams }: BlockCodePageProps) {
  const blockCode = decodeURIComponent(params.blockCode);
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
          <div className="h-64 animate-pulse rounded-lg bg-gray-100" />
        </div>
      }
    >
      <BlockCodeHub
        blockCode={blockCode}
        initialHalkaName={searchParams.halkaName}
        initialTab={parseBlockCodeTab(searchParams.tab ?? null)}
      />
    </Suspense>
  );
}
