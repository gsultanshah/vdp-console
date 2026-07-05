'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import VoterRowPreview from '@/components/voters/VoterRowPreview';
import { formatGenderFromCnic } from '@/lib/cnic';
import type { BlockCodeContext } from '@/lib/blockcode-hub';
import type { PaginatedVotersResponse, VoterBrowseRecord } from '@/lib/voter-browse-types';

interface BlockCodeVotersTabProps {
  context: BlockCodeContext;
}

const PAGE_SIZE_OPTIONS = [25, 50, 100];

function buildQuery(blockCode: string, page: number, limit: number): string {
  return `blockCode=${encodeURIComponent(blockCode)}&page=${page}&limit=${limit}`;
}

export default function BlockCodeVotersTab({ context }: BlockCodeVotersTabProps) {
  const { blockCode } = context;
  const [voters, setVoters] = useState<VoterBrowseRecord[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(50);

  const fetchPage = useCallback(
    async (page: number, size: number, selectIndex = 0) => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const response = await fetch(`/api/voters/?${buildQuery(blockCode, page, size)}`);
        if (!response.ok) throw new Error('Failed to fetch voters');

        const data: PaginatedVotersResponse = await response.json();
        setVoters(data.voters);
        setCurrentPage(data.currentPage);
        setTotalPages(data.totalPages);
        setTotal(data.total);
        setPageSize(data.pageSize);
        setSelectedIndex(Math.min(selectIndex, Math.max(0, data.voters.length - 1)));
      } catch {
        setLoadError('Failed to load voters');
        setVoters([]);
        setTotal(0);
      } finally {
        setIsLoading(false);
      }
    },
    [blockCode]
  );

  useEffect(() => {
    void fetchPage(1, pageSize);
  }, [fetchPage, pageSize]);

  const selected = voters[selectedIndex];
  const rowOffset = (currentPage - 1) * pageSize;
  const globalIndex = total === 0 ? 0 : rowOffset + selectedIndex + 1;
  const gender = selected ? formatGenderFromCnic(selected.cnic) : null;
  const hasRowPreview =
    selected &&
    Boolean(selected.imageUrl) &&
    selected.rowY != null &&
    selected.rowHeight != null;

  const goPrev = () => {
    if (selectedIndex > 0) {
      setSelectedIndex((value) => value - 1);
      return;
    }
    if (currentPage > 1) {
      void fetchPage(currentPage - 1, pageSize, pageSize - 1);
    }
  };

  const goNext = () => {
    if (selectedIndex < voters.length - 1) {
      setSelectedIndex((value) => value + 1);
      return;
    }
    if (currentPage < totalPages) {
      void fetchPage(currentPage + 1, pageSize, 0);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Voter browser</h2>
        <p className="text-sm text-gray-500">
          {total.toLocaleString()} voter{total !== 1 ? 's' : ''} in block {blockCode}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-4">
          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-4 py-3">
              <p className="text-sm font-medium text-gray-900">Voter list</p>
            </div>
            {isLoading && voters.length === 0 ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 8 }, (_, i) => (
                  <div key={i} className="h-14 animate-pulse rounded bg-gray-100" />
                ))}
              </div>
            ) : loadError ? (
              <p className="p-4 text-sm text-red-600">{loadError}</p>
            ) : voters.length === 0 ? (
              <p className="p-4 text-sm text-gray-500">No voters found.</p>
            ) : (
              <ul className="max-h-[28rem] divide-y divide-gray-100 overflow-y-auto">
                {voters.map((voter, index) => (
                  <li key={voter._id}>
                    <button
                      type="button"
                      onClick={() => setSelectedIndex(index)}
                      className={`w-full px-4 py-3 text-left hover:bg-gray-50 ${selectedIndex === index ? 'bg-indigo-50' : ''}`}
                    >
                      <p className="text-xs text-gray-400">#{rowOffset + index + 1}</p>
                      <p className="font-medium text-gray-900" dir="rtl">{voter.name}</p>
                      <p className="font-mono text-xs text-gray-500">{voter.cnic}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {total > 0 && (
              <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
                <button
                  onClick={() => void fetchPage(currentPage - 1, pageSize)}
                  disabled={currentPage <= 1 || isLoading}
                  className="text-sm text-indigo-600 disabled:text-gray-400"
                >
                  Prev page
                </button>
                <span className="text-xs text-gray-500">{currentPage}/{totalPages}</span>
                <button
                  onClick={() => void fetchPage(currentPage + 1, pageSize)}
                  disabled={currentPage >= totalPages || isLoading}
                  className="text-sm text-indigo-600 disabled:text-gray-400"
                >
                  Next page
                </button>
              </div>
            )}
          </div>
          <div className="mt-3 flex items-center gap-2 text-sm text-gray-600">
            <span>Per page</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              disabled={isLoading}
              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="xl:col-span-8">
          {!selected ? (
            <div className="flex min-h-[20rem] items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50">
              <p className="text-sm text-gray-500">Select a voter from the list.</p>
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-white">
              <div className="border-b border-gray-200 px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 text-right" dir="rtl">
                    <h3 className="text-2xl font-bold text-gray-900">{selected.name}</h3>
                    {selected.gharanaNo && <p className="mt-1 text-sm text-gray-600">{selected.gharanaNo}</p>}
                  </div>
                  <div className="flex gap-2">
                    {selected.imageUrl && (
                      <a
                        href={selected.imageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
                      >
                        Full page
                        <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                      </a>
                    )}
                    <Link
                      href={`/dashboard/search-voters?cnic=${encodeURIComponent(selected.cnic)}`}
                      className="rounded-md border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Full profile
                    </Link>
                  </div>
                </div>
                <p className="mt-2 text-sm text-gray-500">
                  Voter {globalIndex.toLocaleString()} of {total.toLocaleString()}
                  {totalPages > 1 && ` · page ${currentPage} of ${totalPages}`}
                </p>
                <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  <div>
                    <dt className="text-xs uppercase text-gray-500">CNIC</dt>
                    <dd className="mt-1 font-mono text-sm">{selected.cnic}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-gray-500">Block</dt>
                    <dd className="mt-1 text-sm">{selected.blockCode}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-gray-500">Halka</dt>
                    <dd className="mt-1 text-sm">{selected.halkaName}</dd>
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
                  {selected.religion && (
                    <div>
                      <dt className="text-xs uppercase text-gray-500">Religion</dt>
                      <dd className="mt-1 text-sm capitalize">{selected.religion}</dd>
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
                  {selected.age && (
                    <div>
                      <dt className="text-xs uppercase text-gray-500">Age</dt>
                      <dd className="mt-1 text-sm">{selected.age}</dd>
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
                {selected.previousAddress && (
                  <p className="mt-1 text-sm text-gray-500" dir="rtl">Previous: {selected.previousAddress}</p>
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
                  <p className="text-sm text-gray-500">No row preview available for this voter.</p>
                )}
              </div>
              <div className="flex items-center justify-center gap-3 border-t border-gray-200 px-5 py-4">
                <button
                  onClick={goPrev}
                  disabled={globalIndex <= 1 || isLoading}
                  className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-4 py-2 text-sm disabled:opacity-40"
                >
                  <ChevronLeftIcon className="h-4 w-4" /> Previous
                </button>
                <button
                  onClick={goNext}
                  disabled={globalIndex >= total || isLoading}
                  className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-4 py-2 text-sm disabled:opacity-40"
                >
                  Next <ChevronRightIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
