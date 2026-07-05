'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowTopRightOnSquareIcon,
  MagnifyingGlassIcon,
  Squares2X2Icon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import VoterRowPreview from '@/components/voters/VoterRowPreview';
import { formatGenderFromCnic } from '@/lib/cnic';
import { blockCodeHubPath } from '@/lib/blockcode-hub';
import { normalizeVoterBrowseRecord } from '@/lib/voter-browse';
import type { VoterBrowseRecord } from '@/lib/voter-browse-types';

interface ConstituencyVoterSearchPanelProps {
  halkaName: string;
}

function fullSearchPageHref(cnic: string): string {
  return `/dashboard/search-voters?cnic=${encodeURIComponent(cnic)}`;
}

export default function ConstituencyVoterSearchPanel({ halkaName }: ConstituencyVoterSearchPanelProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<VoterBrowseRecord[]>([]);
  const [selected, setSelected] = useState<VoterBrowseRecord | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const runSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) {
      toast.error('Enter a CNIC, name, silsila, or gharana number');
      return;
    }

    setIsSearching(true);
    setHasSearched(true);
    setSearchError(null);
    setSelected(null);

    try {
      const params = new URLSearchParams({
        halkaName,
        q: trimmed,
        page: '1',
        limit: '50',
      });
      const response = await fetch(`/api/voters/?${params.toString()}`);
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'Search failed');
      }

      const data = await response.json();
      const voters = ((data.voters ?? data) as Record<string, unknown>[]).map(normalizeVoterBrowseRecord);
      setResults(voters);
      if (voters.length === 1) {
        setSelected(voters[0]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to search voters';
      setSearchError(message);
      toast.error(message);
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
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <MagnifyingGlassIcon className="h-5 w-5 text-indigo-600" />
            Voter search
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Search within {halkaName} by CNIC, name, silsila, gharana, or father name
          </p>
        </div>
        <Link
          href="/dashboard/search-voters/"
          className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
        >
          Open full search page
          <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
        </Link>
      </div>

      <form
        className="mt-4 flex flex-col gap-3 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          void runSearch();
        }}
      >
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="CNIC, name, silsila, gharana…"
            className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
        <button
          type="submit"
          disabled={isSearching}
          className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
        >
          {isSearching ? 'Searching…' : 'Search'}
        </button>
      </form>

      {searchError && (
        <p className="mt-3 text-sm text-red-600">{searchError}</p>
      )}

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/50">
            <div className="border-b border-slate-200 bg-white px-4 py-3">
              <p className="text-sm font-semibold text-slate-900">
                {hasSearched
                  ? `${results.length.toLocaleString()} result${results.length === 1 ? '' : 's'} in ${halkaName}`
                  : 'Results'}
              </p>
            </div>
            <div className="max-h-[28rem] overflow-y-auto bg-white">
              {!hasSearched ? (
                <p className="px-4 py-8 text-center text-sm text-slate-500">
                  Search to see voters without leaving this page.
                </p>
              ) : results.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm text-slate-500">No voters matched your search in this constituency.</p>
                  {query.trim() && (
                    <Link
                      href={fullSearchPageHref(query.trim())}
                      className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:text-indigo-800"
                    >
                      Try full search page
                      <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                    </Link>
                  )}
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {results.map((voter) => (
                    <li key={voter._id}>
                      <button
                        type="button"
                        onClick={() => setSelected(voter)}
                        className={`w-full px-4 py-3 text-left transition hover:bg-indigo-50/60 ${
                          selected?._id === voter._id ? 'bg-indigo-50' : ''
                        }`}
                      >
                        <p className="font-medium text-slate-900" dir="rtl">
                          {voter.name}
                        </p>
                        <p className="mt-0.5 font-mono text-xs text-slate-500">{voter.cnic}</p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          Block {voter.blockCode} · Silsila {voter.silsilaNo}
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
            <div className="flex h-full min-h-[16rem] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/80 p-8 text-center">
              <p className="text-sm text-slate-500">Select a voter to view details and row preview.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 bg-gradient-to-r from-indigo-50 to-violet-50 px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 text-right" dir="rtl">
                    <h3 className="text-xl font-bold text-slate-900">{selected.name}</h3>
                    {selected.gharanaNo && <p className="mt-1 text-sm text-slate-600">{selected.gharanaNo}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={fullSearchPageHref(selected.cnic)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
                    >
                      Full profile
                      <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                    </Link>
                    <Link
                      href={blockCodeHubPath(selected.blockCode, selected.halkaName)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-50"
                    >
                      <Squares2X2Icon className="h-3.5 w-3.5" />
                      Block hub
                    </Link>
                  </div>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">CNIC</dt>
                    <dd className="mt-1 font-mono text-sm text-slate-900">{selected.cnic}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Block</dt>
                    <dd className="mt-1 text-sm text-slate-900">{selected.blockCode}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Silsila</dt>
                    <dd className="mt-1 text-sm text-slate-900">{selected.silsilaNo}</dd>
                  </div>
                  {gender && (
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Gender</dt>
                      <dd className="mt-1 text-sm text-slate-900">{gender}</dd>
                    </div>
                  )}
                  {selected.fatherName && (
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Father</dt>
                      <dd className="mt-1 text-sm text-slate-900" dir="rtl">
                        {selected.fatherName}
                      </dd>
                    </div>
                  )}
                  {selected.profession && (
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Profession</dt>
                      <dd className="mt-1 text-sm text-slate-900" dir="rtl">
                        {selected.profession}
                      </dd>
                    </div>
                  )}
                  {selected.fileName && (
                    <div className="col-span-2 sm:col-span-3">
                      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Source page</dt>
                      <dd className="mt-1 text-sm text-slate-900">{selected.fileName}</dd>
                    </div>
                  )}
                </dl>
                {selected.address && (
                  <p className="mt-3 text-sm text-slate-700" dir="rtl">
                    {selected.address}
                  </p>
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
                  <p className="text-sm text-slate-500">No row preview available for this voter.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
