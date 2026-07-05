'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MapIcon } from '@heroicons/react/24/outline';
import { blockCodeHubPath, sortBlockCodes, type BlockCodeTab } from '@/lib/blockcode-hub';

interface BlockCodeJumpSelectProps {
  blockCodes: string[];
  currentBlockCode: string;
  halkaName: string;
  activeTab: BlockCodeTab;
}

export default function BlockCodeJumpSelect({
  blockCodes,
  currentBlockCode,
  halkaName,
  activeTab,
}: BlockCodeJumpSelectProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');

  const sortedBlockCodes = useMemo(() => sortBlockCodes(blockCodes), [blockCodes]);

  const filteredBlockCodes = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      return sortedBlockCodes;
    }
    return sortedBlockCodes.filter((code) => code.includes(trimmed));
  }, [query, sortedBlockCodes]);

  if (sortedBlockCodes.length === 0) {
    return null;
  }

  const handleJump = (nextBlockCode: string) => {
    if (!nextBlockCode || nextBlockCode === currentBlockCode) {
      return;
    }
    router.push(blockCodeHubPath(nextBlockCode, halkaName, activeTab));
  };

  return (
    <div className="w-full max-w-xs rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <label htmlFor="blockcode-jump" className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
        <MapIcon className="h-4 w-4 text-indigo-500" />
        Jump to block code
      </label>
      {sortedBlockCodes.length > 12 && (
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter block codes…"
          className="mt-2 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      )}
      <select
        id="blockcode-jump"
        value={currentBlockCode}
        onChange={(event) => handleJump(event.target.value)}
        className="mt-2 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      >
        {filteredBlockCodes.length === 0 ? (
          <option value={currentBlockCode}>No matches</option>
        ) : (
          filteredBlockCodes.map((code) => (
            <option key={code} value={code}>
              {code}
              {code === currentBlockCode ? ' · current' : ''}
            </option>
          ))
        )}
      </select>
      <p className="mt-2 text-xs text-gray-500">
        {sortedBlockCodes.length} block code{sortedBlockCodes.length !== 1 ? 's' : ''} in {halkaName}
      </p>
    </div>
  );
}
