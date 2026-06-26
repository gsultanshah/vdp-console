'use client';

import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Progress } from '@/components/ui/progress';
import {
  MAX_TITLE_PAGES,
  pickTitlePageIds,
  TITLE_SCORE_THRESHOLD,
} from '@/lib/title-page-detection';

interface ConstituencyOption {
  _id: string;
  halkaName: string;
  blockCodes: string[];
  status?: 'active' | 'inactive';
}

interface BlockCodePage {
  _id: string;
  blockCode: string;
  fileName: string;
  uploadedAt: string;
}

interface BlockCodeResult {
  blockCode: string;
  status: 'success' | 'error';
  titleCount: number;
  regularCount: number;
  titlePages: { id: string; fileName: string }[];
  message?: string;
}

export default function MarkTitlePagesTab() {
  const [constituencies, setConstituencies] = useState<ConstituencyOption[]>([]);
  const [isLoadingConstituencies, setIsLoadingConstituencies] = useState(true);
  const [selectedHalka, setSelectedHalka] = useState('');
  const [selectedBlockCodes, setSelectedBlockCodes] = useState<string[]>([]);
  const [isMarking, setIsMarking] = useState(false);
  const [currentBlockIndex, setCurrentBlockIndex] = useState(0);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [totalPagesInBlock, setTotalPagesInBlock] = useState(0);
  const [currentBlockCode, setCurrentBlockCode] = useState('');
  const [results, setResults] = useState<BlockCodeResult[]>([]);
  const abortRef = useRef(false);

  const activeConstituency = constituencies.find((c) => c.halkaName === selectedHalka);

  useEffect(() => {
    const fetchConstituencies = async () => {
      setIsLoadingConstituencies(true);
      try {
        const response = await fetch('/api/constituency');
        if (!response.ok) throw new Error('Failed to fetch constituencies');
        const data = await response.json();
        setConstituencies(
          data.map((c: ConstituencyOption) => ({
            _id: c._id,
            halkaName: c.halkaName,
            blockCodes: c.blockCodes ?? [],
            status: c.status,
          }))
        );
      } catch {
        toast.error('Failed to fetch constituencies');
      } finally {
        setIsLoadingConstituencies(false);
      }
    };
    fetchConstituencies();
  }, []);

  useEffect(() => {
    setSelectedBlockCodes([]);
  }, [selectedHalka]);

  const toggleBlockCode = (code: string) => {
    setSelectedBlockCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const handleMarkTitlePages = async () => {
    if (selectedBlockCodes.length === 0) {
      toast.error('Select at least one block code');
      return;
    }

    abortRef.current = false;
    setIsMarking(true);
    setResults([]);
    setCurrentBlockIndex(0);
    setCurrentPageIndex(0);
    setTotalPagesInBlock(0);
    setCurrentBlockCode('');

    for (let blockIdx = 0; blockIdx < selectedBlockCodes.length; blockIdx++) {
      if (abortRef.current) break;

      const blockCode = selectedBlockCodes[blockIdx];
      setCurrentBlockIndex(blockIdx);
      setCurrentBlockCode(blockCode);

      try {
        const listResponse = await fetch(
          `/api/blockcodes?blockCode=${encodeURIComponent(blockCode)}&allowInactive=true`
        );
        if (!listResponse.ok) {
          throw new Error(`Failed to load pages for ${blockCode}`);
        }

        const pages: BlockCodePage[] = await listResponse.json();
        if (!pages.length) {
          setResults((prev) => [
            {
              blockCode,
              status: 'error',
              titleCount: 0,
              regularCount: 0,
              titlePages: [],
              message: 'No uploaded pages found',
            },
            ...prev,
          ]);
          continue;
        }

        const sortedPages = [...pages].sort(
          (a, b) =>
            a.fileName.localeCompare(b.fileName, undefined, { numeric: true }) ||
            new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime()
        );

        setTotalPagesInBlock(sortedPages.length);
        const scoredPages: { id: string; score: number; fileName: string }[] = [];

        for (let pageIdx = 0; pageIdx < sortedPages.length; pageIdx++) {
          if (abortRef.current) break;

          const page = sortedPages[pageIdx];
          setCurrentPageIndex(pageIdx);

          const scoreResponse = await fetch(
            `/api/blockcodes/score-title?page_id=${encodeURIComponent(page._id)}`
          );
          const scoreData = await scoreResponse.json();

          if (!scoreResponse.ok) {
            throw new Error(scoreData.error || scoreData.details || 'Failed to score page');
          }

          scoredPages.push({
            id: page._id,
            score: scoreData.score,
            fileName: page.fileName,
          });
        }

        if (abortRef.current) break;

        const titlePageIds = pickTitlePageIds(scoredPages);

        const applyResponse = await fetch('/api/blockcodes/apply-tags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blockCode, titlePageIds }),
        });
        const applyData = await applyResponse.json();

        if (!applyResponse.ok) {
          throw new Error(applyData.error || applyData.details || 'Failed to apply tags');
        }

        setResults((prev) => [
          {
            blockCode,
            status: 'success',
            titleCount: applyData.titlesUpdated,
            regularCount: applyData.regularUpdated,
            titlePages: applyData.titlePages ?? [],
          },
          ...prev,
        ]);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        setResults((prev) => [
          {
            blockCode,
            status: 'error',
            titleCount: 0,
            regularCount: 0,
            titlePages: [],
            message,
          },
          ...prev,
        ]);
      }
    }

    setIsMarking(false);
    setCurrentBlockCode('');
    setCurrentPageIndex(0);
    setTotalPagesInBlock(0);

    if (abortRef.current) {
      toast('Title page marking stopped');
    } else {
      toast.success('Title page marking finished');
    }
  };

  const handleStop = () => {
    abortRef.current = true;
  };

  const blockProgress =
    selectedBlockCodes.length > 0
      ? Math.round(
          (Math.min(currentBlockIndex + (isMarking ? 1 : 0), selectedBlockCodes.length) /
            selectedBlockCodes.length) *
            100
        )
      : 0;

  const pageProgress =
    totalPagesInBlock > 0
      ? Math.round(
          (Math.min(currentPageIndex + (isMarking ? 1 : 0), totalPagesInBlock) /
            totalPagesInBlock) *
            100
        )
      : 0;

  return (
    <div className="space-y-6">
      <div className="bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6 space-y-5">
          <div>
            <h3 className="text-lg font-medium text-gray-900">Mark Title Pages</h3>
            <p className="mt-1 text-sm text-gray-500">
              OCR each uploaded page one at a time, identify up to {MAX_TITLE_PAGES} title pages
              per block code (cover pages with سرورق / voter summary), mark them as{' '}
              <code className="rounded bg-gray-100 px-1">title</code>, and tag all other pages as{' '}
              <code className="rounded bg-gray-100 px-1">regular</code>.
            </p>
          </div>

          <div>
            <label htmlFor="title-halka" className="block text-sm font-medium text-gray-700">
              Constituency (Halka)
            </label>
            <select
              id="title-halka"
              value={selectedHalka}
              onChange={(e) => setSelectedHalka(e.target.value)}
              disabled={isMarking || isLoadingConstituencies}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-gray-900"
            >
              <option value="">Select a constituency</option>
              {constituencies.map((c) => (
                <option key={c._id} value={c.halkaName}>
                  {c.halkaName}
                  {c.status === 'inactive' ? ' (inactive)' : ''}
                </option>
              ))}
            </select>
          </div>

          {activeConstituency && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">Block codes</label>
                <div className="space-x-2">
                  <button
                    type="button"
                    onClick={() => setSelectedBlockCodes([...activeConstituency.blockCodes])}
                    disabled={isMarking}
                    className="text-sm text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedBlockCodes([])}
                    disabled={isMarking}
                    className="text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="max-h-48 overflow-y-auto rounded-md border border-gray-200 p-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {activeConstituency.blockCodes.map((code) => (
                  <label
                    key={code}
                    className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedBlockCodes.includes(code)}
                      onChange={() => toggleBlockCode(code)}
                      disabled={isMarking}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    {code}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {selectedBlockCodes.length} of {activeConstituency.blockCodes.length} selected
              </p>
            </div>
          )}

          <p className="text-xs text-gray-500">
            Title detection uses OCR keywords (سرورق, voter summary table) and penalizes pages
            with many CNICs. Minimum score threshold: {TITLE_SCORE_THRESHOLD}.
          </p>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleMarkTitlePages}
              disabled={isMarking || selectedBlockCodes.length === 0}
              className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              {isMarking ? 'Marking title pages...' : 'Mark Title Pages'}
            </button>
            {isMarking && (
              <button
                type="button"
                onClick={handleStop}
                className="inline-flex justify-center rounded-md border border-transparent bg-red-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-red-700"
              >
                Stop
              </button>
            )}
          </div>
        </div>
      </div>

      {(isMarking || results.length > 0) && (
        <div className="bg-white shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6 space-y-4">
            <h3 className="text-lg font-medium text-gray-900">Progress</h3>

            <div>
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>
                  Block code{' '}
                  {Math.min(currentBlockIndex + (isMarking ? 1 : 0), selectedBlockCodes.length)}{' '}
                  of {selectedBlockCodes.length}
                  {currentBlockCode ? `: ${currentBlockCode}` : ''}
                </span>
                <span>{blockProgress}%</span>
              </div>
              <Progress value={blockProgress} className="h-3" />
            </div>

            {isMarking && totalPagesInBlock > 0 && (
              <div>
                <div className="flex justify-between text-sm text-gray-600 mb-2">
                  <span>
                    Scoring page {Math.min(currentPageIndex + 1, totalPagesInBlock)} of{' '}
                    {totalPagesInBlock}
                  </span>
                  <span>{pageProgress}%</span>
                </div>
                <Progress value={pageProgress} className="h-2" />
              </div>
            )}

            {results.length > 0 && (
              <div className="max-h-72 overflow-y-auto divide-y divide-gray-100">
                {results.map((result) => (
                  <div key={result.blockCode} className="py-3 text-sm">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${
                          result.status === 'success' ? 'bg-green-500' : 'bg-red-500'
                        }`}
                      />
                      <span className="font-medium text-gray-900">{result.blockCode}</span>
                    </div>
                    {result.status === 'success' ? (
                      <div className="ml-4 mt-1 text-gray-600 space-y-1">
                        <p>
                          {result.titleCount} title, {result.regularCount} regular
                        </p>
                        {result.titlePages.length > 0 && (
                          <ul className="list-disc pl-5">
                            {result.titlePages.map((page) => (
                              <li key={page.id}>{page.fileName}</li>
                            ))}
                          </ul>
                        )}
                        {result.titlePages.length === 0 && (
                          <p className="text-amber-600">No title pages identified</p>
                        )}
                      </div>
                    ) : (
                      <p className="ml-4 mt-1 text-red-600">{result.message}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
