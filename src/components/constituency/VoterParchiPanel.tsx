'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  DocumentTextIcon,
  PhotoIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { Progress } from '@/components/ui/progress';
import { useVoterParchi } from '@/hooks/useVoterParchi';
import { DEFAULT_PARCHI_SLOTS } from '@/lib/voter-parchi/defaults';
import {
  PARCHI_FIELD_DEFINITIONS,
  type ParchiFieldId,
  type ParchiSlotConfig,
  type ParchiSlotId,
  type VoterParchiDesign,
} from '@/lib/voter-parchi/types';

interface VoterParchiPanelProps {
  halkaName: string;
  voterCount?: number | null;
  defaultExpanded?: boolean;
}

const SLOT_LABELS: Record<ParchiSlotId, string> = {
  headerRow: 'Header row (row cutting)',
  leftVisual: 'Left visual (symbol / photo)',
  topRight: 'Top right field',
  topLeft: 'Top left field',
  middleRow: 'Middle row',
  bottomRow: 'Bottom row',
};

function progressPercent(job: { processedVoters: number; totalVoters: number; status: string }): number {
  if (job.totalVoters <= 0) return job.status === 'completed' ? 100 : 0;
  return Math.min(100, Math.round((job.processedVoters / job.totalVoters) * 100));
}

export default function VoterParchiPanel({
  halkaName,
  voterCount,
  defaultExpanded = false,
}: VoterParchiPanelProps) {
  const normalizedHalka = useMemo(() => halkaName.replace(/\s+/g, '').toUpperCase(), [halkaName]);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [isAdmin, setIsAdmin] = useState(false);
  const [designs, setDesigns] = useState<VoterParchiDesign[]>([]);
  const [selectedDesignId, setSelectedDesignId] = useState('');
  const [loadingDesigns, setLoadingDesigns] = useState(false);
  const [savingDesign, setSavingDesign] = useState(false);
  const [uploadingAsset, setUploadingAsset] = useState(false);
  const [genderFilter, setGenderFilter] = useState<'both' | 'male' | 'female'>('both');
  const [activeTab, setActiveTab] = useState<'design' | 'generate'>('design');
  const [blockCodes, setBlockCodes] = useState<string[]>([]);
  const [blockScope, setBlockScope] = useState<'all' | 'selected'>('all');
  const [selectedBlockCodes, setSelectedBlockCodes] = useState<string[]>([]);
  const [blockSearch, setBlockSearch] = useState('');
  const [loadingBlocks, setLoadingBlocks] = useState(false);

  const selectedDesign = designs.find((d) => d._id === selectedDesignId) ?? designs[0] ?? null;

  const {
    activeJob,
    previousJobs,
    isStarting,
    isProcessing,
    loadPreviousJobs,
    startJob,
    cancelProcessing,
  } = useVoterParchi(normalizedHalka);

  useEffect(() => {
    const openFromHash = () => {
      if (window.location.hash === '#voter-parchi') {
        setExpanded(true);
      }
    };
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
    return () => window.removeEventListener('hashchange', openFromHash);
  }, []);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) return;
    try {
      const user = JSON.parse(userStr) as { role?: string };
      setIsAdmin(user.role === 'admin');
    } catch {
      setIsAdmin(false);
    }
  }, []);

  const loadDesigns = useCallback(async () => {
    setLoadingDesigns(true);
    try {
      const params = new URLSearchParams({ halkaName: normalizedHalka });
      const res = await fetch(`/api/voter-parchi/designs?${params.toString()}`);
      const data = (await res.json()) as { designs?: VoterParchiDesign[]; error?: string };
      if (!res.ok) throw new Error(data.error || 'Failed to load designs');
      const list = data.designs ?? [];
      setDesigns(list);
      if (!selectedDesignId && list[0]?._id) {
        setSelectedDesignId(list[0]._id);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load designs');
    } finally {
      setLoadingDesigns(false);
    }
  }, [normalizedHalka, selectedDesignId]);

  const loadBlockCodes = useCallback(async () => {
    setLoadingBlocks(true);
    try {
      const params = new URLSearchParams({ halkaName: normalizedHalka });
      const res = await fetch(`/api/constituency/overview?${params.toString()}`);
      const data = (await res.json()) as { blockCodes?: string[]; error?: string };
      if (!res.ok) throw new Error(data.error || 'Failed to load block codes');
      setBlockCodes((data.blockCodes ?? []).map(String).sort());
    } catch (error) {
      console.error(error);
      setBlockCodes([]);
    } finally {
      setLoadingBlocks(false);
    }
  }, [normalizedHalka]);

  useEffect(() => {
    if (expanded) {
      void loadDesigns();
      void loadBlockCodes();
      if (isAdmin) void loadPreviousJobs();
    }
  }, [expanded, isAdmin, loadDesigns, loadBlockCodes, loadPreviousJobs]);

  const filteredBlockCodes = useMemo(() => {
    const q = blockSearch.trim().toLowerCase();
    if (!q) return blockCodes;
    return blockCodes.filter((code) => code.toLowerCase().includes(q));
  }, [blockCodes, blockSearch]);

  const toggleBlockCode = (code: string) => {
    setSelectedBlockCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const updateSlot = (slotId: ParchiSlotId, patch: Partial<ParchiSlotConfig>) => {
    if (!selectedDesign) return;
    const slots = selectedDesign.slots.map((slot) =>
      slot.slotId === slotId ? { ...slot, ...patch } : slot
    );
    setDesigns((prev) =>
      prev.map((d) => (d._id === selectedDesign._id ? { ...d, slots } : d))
    );
  };

  const handleSaveDesign = async () => {
    if (!selectedDesign?._id) return;
    setSavingDesign(true);
    try {
      const res = await fetch(`/api/voter-parchi/designs/${selectedDesign._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: selectedDesign.name,
          description: selectedDesign.description,
          parchiPerPage: selectedDesign.parchiPerPage,
          slots: selectedDesign.slots,
          customHeaderText: selectedDesign.customHeaderText,
          symbolAssetId: selectedDesign.symbolAssetId,
          photoAssetId: selectedDesign.photoAssetId,
        }),
      });
      const data = (await res.json()) as { design?: VoterParchiDesign; error?: string };
      if (!res.ok) throw new Error(data.error || 'Save failed');
      toast.success('Design saved');
      if (data.design) {
        setDesigns((prev) => prev.map((d) => (d._id === data.design?._id ? data.design! : d)));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Save failed');
    } finally {
      setSavingDesign(false);
    }
  };

  const handleUploadAsset = async (file: File, role: 'symbol' | 'photo' | 'header') => {
    if (!selectedDesign?._id) return;
    setUploadingAsset(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('role', role);
      formData.append('name', file.name);
      const res = await fetch(`/api/voter-parchi/designs/${selectedDesign._id}/assets`, {
        method: 'POST',
        body: formData,
      });
      const data = (await res.json()) as { design?: VoterParchiDesign; error?: string };
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      toast.success('Asset uploaded');
      if (data.design) {
        setDesigns((prev) => prev.map((d) => (d._id === data.design?._id ? data.design! : d)));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setUploadingAsset(false);
    }
  };

  const handleGenerate = async () => {
    if (!selectedDesign?._id) return;
    if (blockScope === 'selected' && selectedBlockCodes.length === 0) {
      toast.error('Select at least one block code.');
      return;
    }
    await startJob({
      halkaName: normalizedHalka,
      designId: selectedDesign._id,
      selectAllBlockCodes: blockScope === 'all',
      blockCodes: blockScope === 'selected' ? selectedBlockCodes : [],
      genderFilter,
    });
  };

  const currentJob = activeJob;
  const pct = currentJob ? progressPercent(currentJob) : 0;

  return (
    <div id="voter-parchi" className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 rounded-2xl px-5 py-4 text-left hover:bg-slate-50"
      >
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-gradient-to-br from-fuchsia-500 to-violet-600 p-2.5 text-white shadow-sm">
            <DocumentTextIcon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Voter parchi</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Design, generate, and download printable voter slips with row cutting for {normalizedHalka}
              {voterCount != null ? ` · ${voterCount.toLocaleString()} voters` : ''}.
            </p>
          </div>
        </div>
        {expanded ? (
          <ChevronUpIcon className="h-5 w-5 shrink-0 text-slate-400" />
        ) : (
          <ChevronDownIcon className="h-5 w-5 shrink-0 text-slate-400" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-5 pb-5 pt-4">
          {!isAdmin ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Admin access is required to design and generate voter parchi PDFs.
            </div>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('design')}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold ${activeTab === 'design' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}
                >
                  Design
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('generate')}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold ${activeTab === 'generate' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}
                >
                  Generate &amp; download
                </button>
                <button
                  type="button"
                  onClick={() => void loadDesigns()}
                  disabled={loadingDesigns}
                  className="ml-auto inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  <ArrowPathIcon className="h-4 w-4" />
                  Refresh
                </button>
              </div>

              {activeTab === 'design' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="block text-sm">
                      <span className="font-medium text-slate-700">Design</span>
                      <select
                        value={selectedDesignId}
                        onChange={(e) => setSelectedDesignId(e.target.value)}
                        className="mt-1 block min-w-[200px] rounded-lg border border-slate-200 px-3 py-2"
                      >
                        {designs.map((d) => (
                          <option key={d._id} value={d._id}>
                            {d.name}{d.isDefault ? ' (default)' : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm">
                      <span className="font-medium text-slate-700">Parchi per page</span>
                      <select
                        value={selectedDesign?.parchiPerPage ?? 3}
                        onChange={(e) => {
                          const value = Number.parseInt(e.target.value, 10);
                          if (!selectedDesign) return;
                          setDesigns((prev) =>
                            prev.map((d) =>
                              d._id === selectedDesign._id ? { ...d, parchiPerPage: value } : d
                            )
                          );
                        }}
                        className="mt-1 block rounded-lg border border-slate-200 px-3 py-2"
                      >
                        <option value={1}>1</option>
                        <option value={2}>2</option>
                        <option value={3}>3</option>
                        <option value={4}>4</option>
                      </select>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 p-4">
                      <h3 className="text-sm font-bold text-slate-900">Slot configuration</h3>
                      <p className="mt-1 text-xs text-slate-500">
                        Map voter data fields to each section of the parchi layout.
                      </p>
                      <div className="mt-3 space-y-3">
                        {(selectedDesign?.slots ?? DEFAULT_PARCHI_SLOTS).map((slot) => (
                          <div key={slot.slotId} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-slate-800">{SLOT_LABELS[slot.slotId]}</p>
                              <label className="flex items-center gap-1 text-xs text-slate-600">
                                <input
                                  type="checkbox"
                                  checked={slot.enabled}
                                  onChange={(e) => updateSlot(slot.slotId, { enabled: e.target.checked })}
                                />
                                Enabled
                              </label>
                            </div>
                            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                              <select
                                value={slot.fieldId}
                                onChange={(e) =>
                                  updateSlot(slot.slotId, { fieldId: e.target.value as ParchiFieldId })
                                }
                                className="rounded border border-slate-200 px-2 py-1.5 text-sm"
                              >
                                {PARCHI_FIELD_DEFINITIONS.map((field) => (
                                  <option key={field.id} value={field.id}>
                                    {field.label}
                                  </option>
                                ))}
                              </select>
                              <input
                                value={slot.labelUrdu ?? slot.label}
                                onChange={(e) =>
                                  updateSlot(slot.slotId, { labelUrdu: e.target.value, label: e.target.value })
                                }
                                placeholder="Urdu label"
                                className="rounded border border-slate-200 px-2 py-1.5 text-sm"
                                dir="auto"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-xl border border-slate-200 p-4">
                        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                          <PhotoIcon className="h-4 w-4" />
                          Visual assets
                        </h3>
                        <p className="mt-1 text-xs text-slate-500">
                          Upload candidate symbol, photo, or header image for the design.
                        </p>
                        <div className="mt-3 space-y-2">
                          {(['symbol', 'photo', 'header'] as const).map((role) => {
                            const asset = selectedDesign?.assets.find((a) =>
                              role === 'symbol'
                                ? a.id === selectedDesign.symbolAssetId
                                : role === 'photo'
                                  ? a.id === selectedDesign.photoAssetId
                                  : a.id === selectedDesign.headerAssetId
                            );
                            return (
                              <div key={role} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 px-3 py-2">
                                <span className="w-16 text-xs font-semibold uppercase text-slate-500">{role}</span>
                                {asset ? (
                                  <a href={asset.url} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:underline">
                                    {asset.name}
                                  </a>
                                ) : (
                                  <span className="text-xs text-slate-400">Not uploaded</span>
                                )}
                                <label className="ml-auto cursor-pointer rounded bg-slate-900 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-800">
                                  Upload
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    disabled={uploadingAsset}
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) void handleUploadAsset(file, role);
                                      e.target.value = '';
                                    }}
                                  />
                                </label>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
                        <h3 className="text-sm font-bold text-slate-900">Layout preview</h3>
                        <div className="mt-3 space-y-2">
                          {Array.from({ length: selectedDesign?.parchiPerPage ?? 3 }).map((_, i) => (
                            <div key={i} className="rounded border border-slate-300 bg-white p-2 text-[10px]">
                              <div className="h-4 rounded bg-amber-100 text-center leading-4 text-amber-800">Row cutting</div>
                              <div className="mt-1 flex gap-1">
                                <div className="flex h-12 w-1/4 items-center justify-center rounded bg-violet-100 text-violet-700">Symbol</div>
                                <div className="flex-1 space-y-1">
                                  <div className="grid grid-cols-2 gap-1">
                                    <div className="rounded bg-slate-100 px-1 py-0.5" dir="auto">شماریاتی کوڈ</div>
                                    <div className="rounded bg-slate-100 px-1 py-0.5" dir="auto">شناختی کارڈ</div>
                                  </div>
                                  <div className="rounded bg-slate-100 px-1 py-0.5" dir="auto">پتہ</div>
                                  <div className="rounded bg-slate-100 px-1 py-0.5" dir="auto">پولنگ اسٹیشن</div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleSaveDesign()}
                        disabled={savingDesign || !selectedDesign}
                        className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {savingDesign ? 'Saving…' : 'Save design'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'generate' && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="block text-sm">
                        <span className="font-medium text-slate-700">Design</span>
                        <select
                          value={selectedDesignId}
                          onChange={(e) => setSelectedDesignId(e.target.value)}
                          className="mt-1 block min-w-[200px] rounded-lg border border-slate-200 px-3 py-2"
                        >
                          {designs.map((d) => (
                            <option key={d._id} value={d._id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-sm">
                        <span className="font-medium text-slate-700">Gender</span>
                        <select
                          value={genderFilter}
                          onChange={(e) => setGenderFilter(e.target.value as typeof genderFilter)}
                          className="mt-1 block rounded-lg border border-slate-200 px-3 py-2"
                        >
                          <option value="both">Both</option>
                          <option value="male">Male</option>
                          <option value="female">Female</option>
                        </select>
                      </label>
                      <label className="block text-sm">
                        <span className="font-medium text-slate-700">Block codes</span>
                        <select
                          value={blockScope}
                          onChange={(e) => setBlockScope(e.target.value as 'all' | 'selected')}
                          className="mt-1 block rounded-lg border border-slate-200 px-3 py-2"
                        >
                          <option value="all">All block codes ({blockCodes.length})</option>
                          <option value="selected">Selected block codes</option>
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={() => void handleGenerate()}
                        disabled={
                          isStarting ||
                          isProcessing ||
                          !selectedDesign ||
                          (blockScope === 'selected' && selectedBlockCodes.length === 0)
                        }
                        className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-600 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
                      >
                        <SparklesIcon className="h-4 w-4" />
                        {isStarting || isProcessing ? 'Generating…' : 'Generate PDF'}
                      </button>
                      {isProcessing && (
                        <button
                          type="button"
                          onClick={cancelProcessing}
                          className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 hover:bg-white"
                        >
                          Stop after current batch
                        </button>
                      )}
                    </div>

                    {blockScope === 'selected' && (
                      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            value={blockSearch}
                            onChange={(e) => setBlockSearch(e.target.value)}
                            placeholder="Search block code…"
                            className="min-w-[160px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedBlockCodes((prev) =>
                                Array.from(new Set([...prev, ...filteredBlockCodes]))
                              )
                            }
                            className="rounded-lg border px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Select visible
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedBlockCodes([])}
                            className="rounded-lg border px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Clear
                          </button>
                          <span className="text-xs text-slate-500">
                            {loadingBlocks
                              ? 'Loading…'
                              : `${selectedBlockCodes.length} selected · ${filteredBlockCodes.length} shown`}
                          </span>
                        </div>
                        <div className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-slate-100">
                          {filteredBlockCodes.length === 0 ? (
                            <p className="px-3 py-4 text-center text-sm text-slate-500">No block codes found</p>
                          ) : (
                            <ul className="divide-y divide-slate-100">
                              {filteredBlockCodes.map((code) => {
                                const checked = selectedBlockCodes.includes(code);
                                return (
                                  <li key={code}>
                                    <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50">
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggleBlockCode(code)}
                                      />
                                      <span className="font-mono">{code}</span>
                                    </label>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                      </div>
                    )}

                    <p className="mt-2 text-xs text-slate-500">
                      Generates in batches of 30 voters. PDFs are saved locally (and uploaded to the server when configured).
                      Prefer one or a few block codes for large constituencies.
                    </p>
                  </div>

                  {currentJob && (
                    <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-indigo-900">
                          {currentJob.status === 'completed'
                            ? 'Generation complete'
                            : currentJob.status === 'failed'
                              ? 'Generation failed'
                              : 'Generating…'}
                        </p>
                        <span className="text-xs text-indigo-700">
                          {currentJob.processedVoters.toLocaleString()} / {currentJob.totalVoters.toLocaleString()} voters
                          {' · '}
                          {currentJob.selectAllBlockCodes
                            ? 'All blocks'
                            : `${currentJob.blockCodes.length} block(s)`}
                        </span>
                      </div>
                      <Progress value={pct} className="mt-2 h-2" />
                      {currentJob.error && (
                        <p className="mt-2 text-xs text-rose-700">{currentJob.error}</p>
                      )}
                      {currentJob.outputFiles.length > 0 && (
                        <div className="mt-3 space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-800">Download links</p>
                          {currentJob.outputFiles.map((file) => (
                            <a
                              key={file.storagePath}
                              href={file.downloadUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center justify-between gap-2 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm hover:bg-indigo-50"
                            >
                              <span className="font-medium text-slate-800">{file.fileName}</span>
                              <span className="inline-flex items-center gap-1 text-indigo-600">
                                <ArrowDownTrayIcon className="h-4 w-4" />
                                {file.voterCount} voters · {(file.sizeBytes / 1024 / 1024).toFixed(1)} MB
                              </span>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {previousJobs.length > 0 && (
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Previous jobs</h3>
                      <div className="mt-2 space-y-2">
                        {previousJobs.slice(0, 8).map((job) => (
                          <div key={job._id} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-medium text-slate-800">{job.designName}</span>
                              <span className="text-xs text-slate-500">
                                {job.status} · {job.processedVoters}/{job.totalVoters}
                                {' · '}
                                {job.selectAllBlockCodes
                                  ? 'all blocks'
                                  : job.blockCodes.length
                                    ? job.blockCodes.join(', ')
                                    : 'no blocks'}
                              </span>
                            </div>
                            {job.error && (
                              <p className="mt-1 text-xs text-rose-600">{job.error}</p>
                            )}
                            {job.outputFiles.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {job.outputFiles.map((file) => (
                                  <a
                                    key={file.storagePath}
                                    href={file.downloadUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-xs text-indigo-600 hover:underline"
                                  >
                                    {file.fileName}
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
