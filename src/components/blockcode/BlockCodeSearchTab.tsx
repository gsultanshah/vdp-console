'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import VoterRowPreview from '@/components/voters/VoterRowPreview';
import { formatGenderFromCnic } from '@/lib/cnic';
import type { BlockCodeContext } from '@/lib/blockcode-hub';
import type { VoterBrowseRecord } from '@/lib/voter-browse-types';

interface BlockCodeSearchTabProps {
  context: BlockCodeContext;
}

export default function BlockCodeSearchTab({ context }: BlockCodeSearchTabProps) {
  const { blockCode, halkaName } = context;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<VoterBrowseRecord[]>([]);
  const [selected, setSelected] = useState<VoterBrowseRecord | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const runSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) {
      toast.error('Enter a CNIC, name, silsila, or gharana number');
      return;
    }

    setIsSearching(true);
    setHasSearched(true);
    setSelected(null);
    try {
      const params = new URLSearchParams({
        blockCode,
        halkaName,
        q: trimmed,
        page: '1',
        limit: '50',
      });
      const response = await fetch(`/api/voters/?${params.toString()}`);
      if (!response.ok) throw new Error('Search failed');

      const data = await response.json();
      const voters: VoterBrowseRecord[] = data.voters ?? data;
      setResults(voters);
      if (voters.length === 1) {
        setSelected(voters[0]);
      }
    } catch {
      toast.error('Failed to search voters');
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const gender = selected ? formatGenderFromCnic(selected.cnic) : null;
  const hasRowPreview =
    selected &&
    Boolean(selected.imageUrl) &&
    selected.rowY != null &&
    selected.rowHeight != null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Search voters in block {blockCode}</h2>
        <p className="text-sm text-gray-500">
          Search by CNIC, name, silsila number, gharana number, or father name within this block.
        </p>
      </div>

      <form
        className="flex flex-col gap-3 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          void runSearch();
        }}
      >
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="CNIC, name, silsila, gharana…"
            className="w-full rounded-md border border-gray-300 py-2.5 pl-10 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <button
          type="submit"
          disabled={isSearching}
          className="rounded-md bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {isSearching ? 'Searching…' : 'Search'}
        </button>
      </form>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-4 py-3">
              <p className="text-sm font-medium text-gray-900">
                {hasSearched
                  ? `${results.length.toLocaleString()} result${results.length === 1 ? '' : 's'}`
                  : 'Results'}
              </p>
            </div>
            <div className="max-h-[32rem] overflow-y-auto">
              {!hasSearched ? (
                <p className="px-4 py-8 text-center text-sm text-gray-500">Enter a search term to find voters.</p>
              ) : results.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-gray-500">No voters matched your search in this block.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {results.map((voter) => (
                    <li key={voter._id}>
                      <button
                        type="button"
                        onClick={() => setSelected(voter)}
                        className={`w-full px-4 py-3 text-left hover:bg-gray-50 ${selected?._id === voter._id ? 'bg-indigo-50' : ''}`}
                      >
                        <p className="font-medium text-gray-900" dir="rtl">{voter.name}</p>
                        <p className="mt-0.5 font-mono text-xs text-gray-500">{voter.cnic}</p>
                        <p className="mt-0.5 text-xs text-gray-400">
                          Silsila {voter.silsilaNo}
                          {voter.gharanaNo ? ` · ${voter.gharanaNo}` : ''}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-3">
          {!selected ? (
            <div className="flex h-full min-h-[16rem] items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
              <p className="text-sm text-gray-500">Select a voter to view full details and row preview.</p>
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-white">
              <div className="border-b border-gray-200 px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 text-right" dir="rtl">
                    <h3 className="text-xl font-bold text-gray-900">{selected.name}</h3>
                    {selected.gharanaNo && <p className="mt-1 text-sm text-gray-600">{selected.gharanaNo}</p>}
                  </div>
                  <Link
                    href={`/dashboard/search-voters?cnic=${encodeURIComponent(selected.cnic)}`}
                    className="rounded-md border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Full profile
                  </Link>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div>
                    <dt className="text-xs uppercase text-gray-500">CNIC</dt>
                    <dd className="mt-1 font-mono text-sm">{selected.cnic}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-gray-500">Silsila</dt>
                    <dd className="mt-1 text-sm">{selected.silsilaNo}</dd>
                  </div>
                  {gender && (
                    <div>
                      <dt className="text-xs uppercase text-gray-500">Gender</dt>
                      <dd className="mt-1 text-sm">{gender}</dd>
                    </div>
                  )}
                  {selected.fatherName && (
                    <div>
                      <dt className="text-xs uppercase text-gray-500">Father</dt>
                      <dd className="mt-1 text-sm" dir="rtl">{selected.fatherName}</dd>
                    </div>
                  )}
                  {selected.profession && (
                    <div>
                      <dt className="text-xs uppercase text-gray-500">Profession</dt>
                      <dd className="mt-1 text-sm" dir="rtl">{selected.profession}</dd>
                    </div>
                  )}
                  {selected.fileName && (
                    <div className="col-span-2">
                      <dt className="text-xs uppercase text-gray-500">Source page</dt>
                      <dd className="mt-1 text-sm">{selected.fileName}</dd>
                    </div>
                  )}
                </dl>
                {selected.address && (
                  <p className="mt-3 text-sm text-gray-700" dir="rtl">{selected.address}</p>
                )}
              </div>
              <div className="p-5">
                {hasRowPreview ? (
                  <VoterRowPreview
                    imageUrl={selected.imageUrl!}
                    rowY={selected.rowY!}
                    rowHeight={selected.rowHeight!}
                    reproduction={selected.reproduction}
                    label={selected.name}
                  />
                ) : (
                  <p className="text-sm text-gray-500">No row preview available.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
