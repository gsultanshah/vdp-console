'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowPathIcon, DocumentDuplicateIcon, FolderOpenIcon } from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { VoterParchiDesign } from '@/lib/voter-parchi/types';
import { fetchJson } from '@/lib/fetch-json';

type LibraryMode = 'open' | 'copy';

interface ConstituencyOption {
  halkaName: string;
  label?: string;
}

interface DesignLibraryDialogProps {
  open: boolean;
  halkaName: string;
  designs: VoterParchiDesign[];
  activeDesignId?: string | null;
  initialMode?: LibraryMode;
  isAdmin?: boolean;
  isCopying?: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenDesign: (design: VoterParchiDesign) => void;
  onCopyDesign: (source: VoterParchiDesign, name: string) => void | Promise<void>;
}

export default function DesignLibraryDialog({
  open,
  halkaName,
  designs,
  activeDesignId,
  initialMode,
  isAdmin = false,
  isCopying = false,
  onOpenChange,
  onOpenDesign,
  onCopyDesign,
}: DesignLibraryDialogProps) {
  const normalizedHalka = halkaName.replace(/\s+/g, '').toUpperCase();
  const [mode, setMode] = useState<LibraryMode>('open');
  const [constituencies, setConstituencies] = useState<ConstituencyOption[]>([]);
  const [loadingConstituencies, setLoadingConstituencies] = useState(false);
  const [sourceHalka, setSourceHalka] = useState('');
  const [sourceDesigns, setSourceDesigns] = useState<VoterParchiDesign[]>([]);
  const [loadingSourceDesigns, setLoadingSourceDesigns] = useState(false);
  const [sourceDesignId, setSourceDesignId] = useState('');
  const [copyName, setCopyName] = useState('');

  const canvasDesigns = useMemo(
    () => designs.filter((d) => d.layoutMode === 'canvas' && d.canvas),
    [designs]
  );

  const sourceCanvasDesigns = useMemo(
    () => sourceDesigns.filter((d) => d.layoutMode === 'canvas' && d.canvas),
    [sourceDesigns]
  );

  const selectedSourceDesign = useMemo(
    () => sourceCanvasDesigns.find((d) => d._id === sourceDesignId) ?? null,
    [sourceCanvasDesigns, sourceDesignId]
  );

  const loadConstituencies = useCallback(async () => {
    setLoadingConstituencies(true);
    try {
      const { response, data } = await fetchJson<ConstituencyOption[]>('/api/constituency?activeOnly=true');
      if (!response.ok) throw new Error('Failed to load constituencies');
      const list = (Array.isArray(data) ? data : [])
        .map((c) => ({
          halkaName: String(c.halkaName ?? '').replace(/\s+/g, '').toUpperCase(),
          label: c.label,
        }))
        .filter((c) => c.halkaName && c.halkaName !== normalizedHalka)
        .sort((a, b) => a.halkaName.localeCompare(b.halkaName));
      setConstituencies(list);
      setSourceHalka((prev) => (prev && list.some((c) => c.halkaName === prev) ? prev : list[0]?.halkaName ?? ''));
    } catch {
      setConstituencies([]);
      setSourceHalka('');
    } finally {
      setLoadingConstituencies(false);
    }
  }, [normalizedHalka]);

  const loadSourceDesigns = useCallback(async (halka: string) => {
    if (!halka) {
      setSourceDesigns([]);
      setSourceDesignId('');
      return;
    }
    setLoadingSourceDesigns(true);
    try {
      const { response, data } = await fetchJson<{ designs: VoterParchiDesign[] }>(
        `/api/voter-parchi/designs?halkaName=${encodeURIComponent(halka)}`
      );
      if (!response.ok) throw new Error('Failed to load designs');
      const list = (data.designs ?? []).filter((d) => d.layoutMode === 'canvas' && d.canvas);
      setSourceDesigns(list);
      setSourceDesignId(list[0]?._id ?? '');
    } catch {
      setSourceDesigns([]);
      setSourceDesignId('');
    } finally {
      setLoadingSourceDesigns(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode ?? (canvasDesigns.length > 0 ? 'open' : isAdmin ? 'copy' : 'open'));
  }, [open, initialMode, canvasDesigns.length, isAdmin]);

  useEffect(() => {
    if (!open || !isAdmin) return;
    void loadConstituencies();
  }, [open, isAdmin, loadConstituencies]);

  useEffect(() => {
    if (!open || mode !== 'copy' || !sourceHalka) return;
    void loadSourceDesigns(sourceHalka);
  }, [open, mode, sourceHalka, loadSourceDesigns]);

  useEffect(() => {
    if (!selectedSourceDesign) {
      setCopyName('');
      return;
    }
    setCopyName(`${normalizedHalka} — ${selectedSourceDesign.name}`);
  }, [selectedSourceDesign, normalizedHalka]);

  const handleCopy = async () => {
    if (!selectedSourceDesign || !copyName.trim()) return;
    await onCopyDesign(selectedSourceDesign, copyName.trim());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-slate-100 px-6 py-5">
          <DialogTitle>Design library</DialogTitle>
          <DialogDescription>
            Open an existing canvas design for {normalizedHalka} or copy one from another constituency.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 py-5">
          <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setMode('open')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition ${
                mode === 'open' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FolderOpenIcon className="h-4 w-4" />
              Open existing
            </button>
            {isAdmin ? (
              <button
                type="button"
                onClick={() => setMode('copy')}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition ${
                  mode === 'copy' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <DocumentDuplicateIcon className="h-4 w-4" />
                Copy from constituency
              </button>
            ) : null}
          </div>

          {mode === 'open' ? (
            <div className="space-y-2">
              {canvasDesigns.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                  No canvas designs in this constituency yet.
                  {isAdmin ? ' Create a new design or copy from another constituency.' : ''}
                </p>
              ) : (
                <ul className="max-h-64 space-y-2 overflow-y-auto">
                  {canvasDesigns.map((item) => {
                    const active = item._id === activeDesignId;
                    return (
                      <li key={item._id}>
                        <button
                          type="button"
                          onClick={() => {
                            onOpenDesign(item);
                            onOpenChange(false);
                          }}
                          className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition hover:border-indigo-300 hover:bg-indigo-50 ${
                            active ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white'
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">{item.name}</p>
                            <p className="text-xs text-slate-500">
                              {item.parchiPerPage}/A4
                              {item.canvas?.slipWidthMm && item.canvas?.slipHeightMm
                                ? ` · ${item.canvas.slipWidthMm}×${item.canvas.slipHeightMm} mm`
                                : ''}
                            </p>
                          </div>
                          {active ? (
                            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-indigo-600">
                              Open
                            </span>
                          ) : (
                            <FolderOpenIcon className="h-4 w-4 shrink-0 text-slate-400" />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-2">
                <Label htmlFor="source-constituency">Source constituency</Label>
                <select
                  id="source-constituency"
                  value={sourceHalka}
                  onChange={(e) => setSourceHalka(e.target.value)}
                  disabled={loadingConstituencies || constituencies.length === 0}
                  className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
                >
                  {loadingConstituencies ? <option value="">Loading…</option> : null}
                  {!loadingConstituencies && constituencies.length === 0 ? (
                    <option value="">No other constituencies</option>
                  ) : null}
                  {constituencies.map((c) => (
                    <option key={c.halkaName} value={c.halkaName}>
                      {c.halkaName}
                      {c.label ? ` — ${c.label}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="source-design">Design to copy</Label>
                <select
                  id="source-design"
                  value={sourceDesignId}
                  onChange={(e) => setSourceDesignId(e.target.value)}
                  disabled={loadingSourceDesigns || sourceCanvasDesigns.length === 0}
                  className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
                >
                  {loadingSourceDesigns ? <option value="">Loading designs…</option> : null}
                  {!loadingSourceDesigns && sourceCanvasDesigns.length === 0 ? (
                    <option value="">No canvas designs</option>
                  ) : null}
                  {sourceCanvasDesigns.map((d) => (
                    <option key={d._id} value={d._id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="copy-design-name">New design name</Label>
                <Input
                  id="copy-design-name"
                  value={copyName}
                  onChange={(e) => setCopyName(e.target.value)}
                  placeholder={`${normalizedHalka} design name`}
                />
              </div>

              <p className="text-xs text-slate-500">
                Layout and fields are copied. Uploaded images are not — re-add symbol, photo, and custom images after
                copying.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 border-t border-slate-100 px-6 py-4 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isCopying}>
            Close
          </Button>
          {mode === 'copy' && isAdmin ? (
            <Button
              type="button"
              onClick={() => void handleCopy()}
              disabled={isCopying || !selectedSourceDesign || !copyName.trim()}
            >
              {isCopying ? (
                <>
                  <ArrowPathIcon className="mr-2 h-4 w-4 animate-spin" />
                  Copying…
                </>
              ) : (
                'Copy design'
              )}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
