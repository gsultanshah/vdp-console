'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Progress } from '@/components/ui/progress';

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
  halkaName: string;
  status: string;
  uploadedAt: string;
}

interface PageLogEntry {
  id: string;
  blockCode: string;
  fileName: string;
  status: 'success' | 'error' | 'skipped';
  votersSaved: number;
  errors: number;
  message?: string;
}

const PROCESSABLE_STATUSES = ['uploaded', 'pending', 'error', 'processing'];

export default function ProcessVoterTab() {
  const [constituencies, setConstituencies] = useState<ConstituencyOption[]>([]);
  const [isLoadingConstituencies, setIsLoadingConstituencies] = useState(true);
  const [selectedHalka, setSelectedHalka] = useState('');
  const [selectedBlockCodes, setSelectedBlockCodes] = useState<string[]>([]);
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingPages, setIsLoadingPages] = useState(false);
  const [pageQueue, setPageQueue] = useState<BlockCodePage[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [currentBlockCode, setCurrentBlockCode] = useState('');
  const [totalVotersSaved, setTotalVotersSaved] = useState(0);
  const [totalErrors, setTotalErrors] = useState(0);
  const [log, setLog] = useState<PageLogEntry[]>([]);
  const abortRef = useRef(false);

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

  const activeConstituency = constituencies.find((c) => c.halkaName === selectedHalka);

  useEffect(() => {
    setSelectedBlockCodes([]);
    setPageQueue([]);
  }, [selectedHalka]);

  const toggleBlockCode = (code: string) => {
    setSelectedBlockCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const selectAllBlockCodes = () => {
    if (!activeConstituency) return;
    setSelectedBlockCodes([...activeConstituency.blockCodes]);
  };

  const clearBlockCodes = () => setSelectedBlockCodes([]);

  const buildPageQueue = useCallback(async (): Promise<BlockCodePage[]> => {
    const queue: BlockCodePage[] = [];

    for (const blockCode of selectedBlockCodes) {
      const response = await fetch(`/api/blockcodes?blockCode=${encodeURIComponent(blockCode)}`);
      if (!response.ok) {
        throw new Error(`Failed to load pages for block code ${blockCode}`);
      }
      const pages: BlockCodePage[] = await response.json();
      const filtered = includeCompleted
        ? pages
        : pages.filter((p) => PROCESSABLE_STATUSES.includes(p.status));
      queue.push(...filtered);
    }

    return queue.sort(
      (a, b) =>
        a.blockCode.localeCompare(b.blockCode) ||
        new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime()
    );
  }, [selectedBlockCodes, includeCompleted]);

  const handlePreviewQueue = async () => {
    if (selectedBlockCodes.length === 0) {
      toast.error('Select at least one block code');
      return;
    }
    setIsLoadingPages(true);
    try {
      const queue = await buildPageQueue();
      setPageQueue(queue);
      if (queue.length === 0) {
        toast.error('No pages to process for the selected block codes');
      } else {
        toast.success(`${queue.length} page(s) ready to process`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load pages');
    } finally {
      setIsLoadingPages(false);
    }
  };

  const handleStartProcessing = async () => {
    if (selectedBlockCodes.length === 0) {
      toast.error('Select at least one block code');
      return;
    }

    abortRef.current = false;
    setIsProcessing(true);
    setLog([]);
    setCurrentPageIndex(0);
    setTotalVotersSaved(0);
    setTotalErrors(0);
    setCurrentBlockCode('');

    let queue = pageQueue;
    if (queue.length === 0) {
      setIsLoadingPages(true);
      try {
        queue = await buildPageQueue();
        setPageQueue(queue);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to load pages');
        setIsProcessing(false);
        setIsLoadingPages(false);
        return;
      }
      setIsLoadingPages(false);
    }

    if (queue.length === 0) {
      toast.error('No pages to process');
      setIsProcessing(false);
      return;
    }

    for (let i = 0; i < queue.length; i++) {
      if (abortRef.current) break;

      const page = queue[i];
      setCurrentPageIndex(i);
      setCurrentBlockCode(page.blockCode);

      try {
        const response = await fetch(
          `/api/process-page?page_id=${encodeURIComponent(page._id)}`
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || data.details || 'Processing failed');
        }

        setTotalVotersSaved((prev) => prev + (data.processed_count ?? 0));
        setTotalErrors((prev) => prev + (data.error_count ?? 0));

        setLog((prev) => [
          {
            id: page._id,
            blockCode: page.blockCode,
            fileName: page.fileName,
            status: 'success',
            votersSaved: data.processed_count ?? 0,
            errors: data.error_count ?? 0,
          },
          ...prev,
        ]);
        setCurrentPageIndex(i + 1);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        setTotalErrors((prev) => prev + 1);
        setLog((prev) => [
          {
            id: page._id,
            blockCode: page.blockCode,
            fileName: page.fileName,
            status: 'error',
            votersSaved: 0,
            errors: 1,
            message,
          },
          ...prev,
        ]);
        setCurrentPageIndex(i + 1);
      }
    }

    setIsProcessing(false);
    setCurrentPageIndex(queue.length);
    setCurrentBlockCode('');
    if (abortRef.current) {
      toast('Processing stopped');
    } else {
      toast.success('Processing finished');
    }
  };

  const handleStop = () => {
    abortRef.current = true;
  };

  const progressPercent =
    pageQueue.length > 0
      ? Math.round((Math.min(currentPageIndex, pageQueue.length) / pageQueue.length) * 100)
      : 0;

  return (
    <div className="space-y-6">
      <div className="bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6 space-y-5">
          <div>
            <h3 className="text-lg font-medium text-gray-900">Process Voters</h3>
            <p className="mt-1 text-sm text-gray-500">
              Process uploaded voter list pages one at a time via OCR. Each page is sent to{' '}
              <code className="rounded bg-gray-100 px-1">/api/process-page</code> sequentially.
            </p>
          </div>

          <div>
            <label htmlFor="process-halka" className="block text-sm font-medium text-gray-700">
              Constituency (Halka)
            </label>
            <select
              id="process-halka"
              value={selectedHalka}
              onChange={(e) => setSelectedHalka(e.target.value)}
              disabled={isProcessing || isLoadingConstituencies}
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
            {activeConstituency?.status === 'inactive' && (
              <p className="mt-2 text-sm text-amber-600">
                This constituency is inactive. Reactivate it on the Constituency page before processing.
              </p>
            )}
          </div>

          {activeConstituency && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">Block codes</label>
                <div className="space-x-2">
                  <button
                    type="button"
                    onClick={selectAllBlockCodes}
                    disabled={isProcessing}
                    className="text-sm text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={clearBlockCodes}
                    disabled={isProcessing}
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
                      disabled={isProcessing}
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

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={includeCompleted}
              onChange={(e) => setIncludeCompleted(e.target.checked)}
              disabled={isProcessing}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            Include already completed pages (re-process)
          </label>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handlePreviewQueue}
              disabled={isProcessing || isLoadingPages || selectedBlockCodes.length === 0}
              className="inline-flex justify-center rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
            >
              {isLoadingPages ? 'Loading...' : 'Preview queue'}
            </button>
            <button
              type="button"
              onClick={handleStartProcessing}
              disabled={isProcessing || selectedBlockCodes.length === 0}
              className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              {isProcessing ? 'Processing...' : 'Start processing'}
            </button>
            {isProcessing && (
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

      {(isProcessing || pageQueue.length > 0) && (
        <div className="bg-white shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6 space-y-4">
            <h3 className="text-lg font-medium text-gray-900">Progress</h3>

            <div>
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>
                  {isProcessing
                    ? `Processing page ${Math.min(currentPageIndex + 1, pageQueue.length)} of ${pageQueue.length}`
                    : `Completed ${currentPageIndex} of ${pageQueue.length}`}
                </span>
                <span>{progressPercent}%</span>
              </div>
              <Progress value={progressPercent} className="h-3" />
            </div>

            {currentBlockCode && isProcessing && (
              <p className="text-sm text-gray-600">
                Processing block code: <strong>{currentBlockCode}</strong>
              </p>
            )}

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div className="rounded-lg bg-green-50 p-3">
                <p className="text-xs text-green-700">Voters saved</p>
                <p className="text-xl font-semibold text-green-900">{totalVotersSaved}</p>
              </div>
              <div className="rounded-lg bg-red-50 p-3">
                <p className="text-xs text-red-700">Errors</p>
                <p className="text-xl font-semibold text-red-900">{totalErrors}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs text-gray-600">Pages in queue</p>
                <p className="text-xl font-semibold text-gray-900">{pageQueue.length}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {log.length > 0 && (
        <div className="bg-white shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Activity log</h3>
            <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
              {log.map((entry) => (
                <div key={entry.id} className="py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        entry.status === 'success' ? 'bg-green-500' : 'bg-red-500'
                      }`}
                    />
                    <span className="font-medium text-gray-900">{entry.blockCode}</span>
                    <span className="text-gray-500 truncate">{entry.fileName}</span>
                  </div>
                  <p className="ml-4 text-gray-600">
                    {entry.status === 'success'
                      ? `${entry.votersSaved} voter(s) saved${entry.errors ? `, ${entry.errors} error(s)` : ''}`
                      : entry.message}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
