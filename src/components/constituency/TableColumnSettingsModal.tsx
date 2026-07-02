'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { XMarkIcon, SparklesIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import {
  BLOCKCODE_PAGE_SAMPLE_LIMIT,
  KNOWN_COLUMN_IDS,
  normalizeColumnDefinitions,
  type ConstituencyTableColumnSettings,
  type TableColumnDefinition,
} from '@/lib/table-column-settings';

interface SamplePage {
  _id: string;
  blockCode: string;
  fileName: string;
  url: string;
  tag?: string;
}

interface TableColumnSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  constituencyId: string;
  halkaName: string;
  blockCodes?: string[];
  blockCode?: string;
  pageId?: string;
  imageUrl?: string;
  initialSettings?: ConstituencyTableColumnSettings | null;
  onSaved?: (settings: ConstituencyTableColumnSettings) => void;
}

const COLUMN_COLORS = [
  'rgba(99, 102, 241, 0.35)',
  'rgba(16, 185, 129, 0.35)',
  'rgba(14, 165, 233, 0.35)',
  'rgba(239, 68, 68, 0.35)',
  'rgba(245, 158, 11, 0.35)',
  'rgba(168, 85, 247, 0.35)',
  'rgba(107, 114, 128, 0.35)',
  'rgba(75, 85, 99, 0.35)',
];

export default function TableColumnSettingsModal({
  isOpen,
  onClose,
  constituencyId,
  halkaName,
  blockCodes: blockCodesProp,
  blockCode: initialBlockCode,
  pageId: initialPageId,
  imageUrl: initialImageUrl,
  initialSettings,
  onSaved,
}: TableColumnSettingsModalProps) {
  const [blockCodes, setBlockCodes] = useState<string[]>(blockCodesProp ?? []);
  const [selectedBlockCode, setSelectedBlockCode] = useState(initialBlockCode ?? '');
  const [columns, setColumns] = useState<TableColumnDefinition[]>([]);
  const [selectedPageId, setSelectedPageId] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [samplePages, setSamplePages] = useState<SamplePage[]>([]);
  const [isLoadingPages, setIsLoadingPages] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);

  const normalizedColumns = useMemo(() => normalizeColumnDefinitions(columns), [columns]);

  const loadBlockCodes = useCallback(async () => {
    if (blockCodesProp?.length) {
      setBlockCodes(blockCodesProp);
      return;
    }

    try {
      const response = await fetch(
        `/api/constituency/table-columns?constituencyId=${encodeURIComponent(constituencyId)}`
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load block codes');
      }
      setBlockCodes(data.blockCodes ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load block codes');
      setBlockCodes([]);
    }
  }, [blockCodesProp, constituencyId]);

  const loadSettings = useCallback(async () => {
    setIsLoadingSettings(true);
    try {
      const response = await fetch(
        `/api/constituency/table-columns?constituencyId=${encodeURIComponent(constituencyId)}`
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load settings');
      }
      if (data.tableColumnSettings?.columns?.length) {
        setColumns(data.tableColumnSettings.columns);
      } else if (initialSettings?.columns?.length) {
        setColumns(initialSettings.columns);
      } else {
        setColumns([]);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load column settings');
      setColumns(initialSettings?.columns ?? []);
    } finally {
      setIsLoadingSettings(false);
    }
  }, [constituencyId, initialSettings]);

  const loadSamplePages = useCallback(async (blockCode: string) => {
    if (!blockCode) {
      setSamplePages([]);
      return;
    }

    setIsLoadingPages(true);
    try {
      const params = new URLSearchParams({
        blockCode,
        page: '1',
        limit: String(BLOCKCODE_PAGE_SAMPLE_LIMIT),
      });
      const response = await fetch(`/api/blockcodes?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load pages');
      }
      const uploads = (data.uploads ?? data) as SamplePage[];
      const pages = uploads
        .filter((page) => page.tag !== 'title' && page.url)
        .slice(0, BLOCKCODE_PAGE_SAMPLE_LIMIT);
      setSamplePages(pages);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load sample pages');
      setSamplePages([]);
    } finally {
      setIsLoadingPages(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const nextBlockCode = initialBlockCode ?? blockCodesProp?.[0] ?? '';
    setSelectedBlockCode(nextBlockCode);
    setSelectedPageId(initialPageId ?? '');
    setImageUrl(initialImageUrl ?? '');
    void loadBlockCodes();
    void loadSettings();
  }, [isOpen, initialBlockCode, initialPageId, initialImageUrl, blockCodesProp, loadBlockCodes, loadSettings]);

  useEffect(() => {
    if (!isOpen || !selectedBlockCode) return;
    void loadSamplePages(selectedBlockCode);
  }, [isOpen, selectedBlockCode, loadSamplePages]);

  useEffect(() => {
    if (blockCodesProp?.length) {
      setBlockCodes(blockCodesProp);
    }
  }, [blockCodesProp]);

  useEffect(() => {
    if (!selectedPageId) {
      if (!initialImageUrl) {
        setImageUrl('');
      }
      return;
    }
    const page = samplePages.find((item) => item._id === selectedPageId);
    if (page?.url) {
      setImageUrl(page.url);
    }
  }, [selectedPageId, samplePages, initialImageUrl]);

  useEffect(() => {
    if (!isOpen || !initialPageId || !samplePages.length) return;
    const match = samplePages.find((page) => page._id === initialPageId);
    if (match) {
      setSelectedPageId(initialPageId);
      setImageUrl(match.url);
    }
  }, [isOpen, initialPageId, samplePages]);

  const handleBlockCodeChange = (blockCode: string) => {
    setSelectedBlockCode(blockCode);
    setSelectedPageId('');
    setImageUrl('');
    setSamplePages([]);
  };

  const detectColumns = async () => {
    if (!selectedPageId) {
      toast.error('Select a page first, then run detection');
      return;
    }

    setIsDetecting(true);
    try {
      const response = await fetch('/api/constituency/table-columns/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: selectedPageId }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Detection failed');
      }
      setColumns(data.columns ?? []);
      if (data.imageUrl) {
        setImageUrl(data.imageUrl);
      }
      toast.success(`Detected ${data.columns?.length ?? 0} columns from selected page`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Detection failed');
    } finally {
      setIsDetecting(false);
    }
  };

  const saveSettings = async () => {
    if (!normalizedColumns.length) {
      toast.error('Add or detect columns before saving');
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch('/api/constituency/table-columns', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          constituencyId,
          columns: normalizedColumns,
          sourcePageId: selectedPageId || undefined,
          sourceBlockCode: selectedBlockCode || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save');
      }
      toast.success(`Column settings saved for ${halkaName}`);
      onSaved?.(data.tableColumnSettings);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const updateColumn = (index: number, patch: Partial<TableColumnDefinition>) => {
    setColumns((current) =>
      current.map((column, columnIndex) =>
        columnIndex === index ? { ...column, ...patch } : column
      )
    );
  };

  const addColumn = () => {
    setColumns((current) => [
      ...current,
      {
        id: `col_${current.length}`,
        label: `Column ${current.length + 1}`,
        minXRatio: 0,
        maxXRatio: 0.1,
        index: current.length,
      },
    ]);
  };

  const removeColumn = (index: number) => {
    setColumns((current) => current.filter((_, columnIndex) => columnIndex !== index));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Table column settings</h2>
            <p className="text-sm text-gray-500">
              {halkaName} · save once for all block codes · sample up to {BLOCKCODE_PAGE_SAMPLE_LIMIT} pages per block code
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-gray-500 hover:bg-gray-100"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-hidden p-5 lg:grid-cols-2">
          <div className="flex min-h-0 flex-col gap-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700">Block code</span>
                <select
                  value={selectedBlockCode}
                  onChange={(event) => handleBlockCodeChange(event.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Select block code…</option>
                  {blockCodes.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700">
                  Sample page ({samplePages.length}/{BLOCKCODE_PAGE_SAMPLE_LIMIT})
                </span>
                <select
                  value={selectedPageId}
                  onChange={(event) => setSelectedPageId(event.target.value)}
                  disabled={!selectedBlockCode || isLoadingPages}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
                >
                  <option value="">Select page…</option>
                  {samplePages.map((page) => (
                    <option key={page._id} value={page._id}>
                      {page.fileName}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void detectColumns()}
                disabled={isDetecting || !selectedPageId}
                className="inline-flex items-center rounded-md bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
              >
                <SparklesIcon className={`mr-2 h-4 w-4 ${isDetecting ? 'animate-pulse' : ''}`} />
                {isDetecting ? 'Detecting…' : 'Detect on selected page'}
              </button>
              {!selectedPageId ? (
                <span className="text-xs text-gray-500">Choose a page before running AI detection</span>
              ) : null}
            </div>

            <div className="relative min-h-[320px] flex-1 overflow-auto rounded-lg border border-gray-200 bg-gray-50">
              {imageUrl ? (
                <div className="relative inline-block min-w-full">
                  <img src={imageUrl} alt="Sample voter list page" className="block w-full" />
                  <div className="pointer-events-none absolute inset-0">
                    {normalizedColumns.map((column, index) => (
                      <div
                        key={`${column.id}-${index}`}
                        className="absolute top-0 bottom-0 border-x-2"
                        style={{
                          left: `${column.minXRatio * 100}%`,
                          width: `${(column.maxXRatio - column.minXRatio) * 100}%`,
                          backgroundColor: COLUMN_COLORS[index % COLUMN_COLORS.length],
                          borderColor: COLUMN_COLORS[index % COLUMN_COLORS.length].replace('0.35', '0.9'),
                        }}
                      >
                        <span className="absolute left-1 top-1 rounded bg-white/90 px-1 text-[10px] font-medium text-gray-700">
                          {column.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center p-8 text-sm text-gray-500">
                  {!selectedBlockCode
                    ? 'Select a block code'
                    : isLoadingPages
                      ? 'Loading pages…'
                      : 'Select a sample page to preview'}
                </div>
              )}
            </div>
          </div>

          <div className="flex min-h-0 flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">
                Columns ({normalizedColumns.length})
              </h3>
              <button
                type="button"
                onClick={addColumn}
                className="inline-flex items-center rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                <PlusIcon className="mr-1 h-4 w-4" />
                Add
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-auto pr-1">
              {isLoadingSettings && !columns.length ? (
                <p className="text-sm text-gray-500">Loading saved settings…</p>
              ) : null}

              {columns.map((column, index) => (
                <div key={`column-editor-${column.id}-${index}`} className="rounded-lg border border-gray-200 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Column {index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeColumn(index)}
                      className="rounded p-1 text-red-500 hover:bg-red-50"
                      title="Remove column"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="text-xs">
                      <span className="mb-1 block text-gray-600">Label</span>
                      <input
                        type="text"
                        value={column.label}
                        onChange={(event) => updateColumn(index, { label: event.target.value })}
                        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                      />
                    </label>
                    <label className="text-xs">
                      <span className="mb-1 block text-gray-600">Field id</span>
                      <input
                        type="text"
                        list={`column-id-options-${index}`}
                        value={column.id}
                        onChange={(event) => updateColumn(index, { id: event.target.value })}
                        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                      />
                      <datalist id={`column-id-options-${index}`}>
                        {KNOWN_COLUMN_IDS.map((id) => (
                          <option key={id} value={id} />
                        ))}
                      </datalist>
                    </label>
                    <label className="text-xs">
                      <span className="mb-1 block text-gray-600">Left ({Math.round(column.minXRatio * 100)}%)</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={Math.round(column.minXRatio * 100)}
                        onChange={(event) =>
                          updateColumn(index, { minXRatio: Number(event.target.value) / 100 })
                        }
                        className="w-full"
                      />
                    </label>
                    <label className="text-xs">
                      <span className="mb-1 block text-gray-600">Right ({Math.round(column.maxXRatio * 100)}%)</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={Math.round(column.maxXRatio * 100)}
                        onChange={(event) =>
                          updateColumn(index, { maxXRatio: Number(event.target.value) / 100 })
                        }
                        className="w-full"
                      />
                    </label>
                  </div>
                </div>
              ))}

              {!normalizedColumns.length && !isLoadingSettings ? (
                <p className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-500">
                  No columns yet. Select a block code and page, then detect — settings apply to the whole constituency.
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void saveSettings()}
            disabled={isSaving || !normalizedColumns.length}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {isSaving ? 'Saving…' : 'Save for constituency'}
          </button>
        </div>
      </div>
    </div>
  );
}
