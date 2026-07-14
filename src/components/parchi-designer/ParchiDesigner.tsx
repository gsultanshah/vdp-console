'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDownTrayIcon,
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  ArrowUturnLeftIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DocumentDuplicateIcon,
  PhotoIcon,
  PlusIcon,
  Squares2X2Icon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import DesignerCanvas from '@/components/parchi-designer/designer-canvas';
import ElementStyleControls from '@/components/parchi-designer/element-style-controls';
import NewDesignDialog, { type NewDesignFormValues } from '@/components/parchi-designer/NewDesignDialog';
import { ShapeToolboxButton } from '@/components/parchi-designer/shape-toolbox';
import { useCanvasHistory } from '@/components/parchi-designer/use-canvas-history';
import { defaultElementForType, defaultShapeElement, newCanvasElementId, type ParchiShapePreset } from '@/components/parchi-designer/canvas-element';
import { createCanvasDesignFromTemplate } from '@/lib/voter-parchi/canvas-templates';
import { alignCanvasElements, type ElementAlignMode } from '@/lib/voter-parchi/element-alignment';
import { constituencyHomePath } from '@/lib/constituency-path';
import { fetchJson } from '@/lib/fetch-json';
import {
  PARCHI_FIELD_DEFINITIONS,
  type ParchiCanvasElement,
  type ParchiCanvasElementStyle,
  type ParchiCanvasElementType,
  type ParchiFieldId,
  type ParchiVoterRecord,
  type VoterParchiDesign,
} from '@/lib/voter-parchi/types';
import { sortCanvasElements } from '@/lib/voter-parchi/canvas-utils';
import {
  A4_HEIGHT_MM,
  A4_WIDTH_MM,
  DEFAULT_SLIP_HEIGHT_MM,
  DEFAULT_SLIP_WIDTH_MM,
  resolveSlipSizeMm,
} from '@/lib/voter-parchi/canvas-layout';
import {
  type ParchiElementImageUploadState,
  prepareParchiElementImage,
  uploadDesignAssetWithProgress,
} from '@/lib/voter-parchi/parchi-image-upload';

interface ParchiDesignerProps {
  halkaName: string;
}

const PAGE_OPTIONS = [1, 2, 3, 4, 5];

const SLIP_SIZE_PRESETS = [
  { label: 'Campaign (148×74)', widthMm: 148, heightMm: 74 },
  { label: 'Half A4 wide (105×148)', widthMm: 105, heightMm: 148 },
  { label: 'Full A4 width (210×99)', widthMm: 210, heightMm: 99 },
  { label: 'Compact (120×60)', widthMm: 120, heightMm: 60 },
] as const;

export default function ParchiDesigner({ halkaName }: ParchiDesignerProps) {
  const normalizedHalka = useMemo(() => halkaName.replace(/\s+/g, '').toUpperCase(), [halkaName]);
  const [designs, setDesigns] = useState<VoterParchiDesign[]>([]);
  const [design, setDesign] = useState<VoterParchiDesign | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showA4Guides, setShowA4Guides] = useState(true);
  const [uploadingBg, setUploadingBg] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [blockCodes, setBlockCodes] = useState<string[]>([]);
  const [selectedBlockCode, setSelectedBlockCode] = useState('');
  const [blockSearch, setBlockSearch] = useState('');
  const [loadingBlocks, setLoadingBlocks] = useState(false);
  const [previewVoters, setPreviewVoters] = useState<ParchiVoterRecord[]>([]);
  const [loadingPreviewVoters, setLoadingPreviewVoters] = useState(false);
  const [newDesignOpen, setNewDesignOpen] = useState(false);
  const [creatingDesign, setCreatingDesign] = useState(false);
  const [elementImageUploads, setElementImageUploads] = useState<Record<string, ParchiElementImageUploadState>>({});
  const shellRef = useRef<HTMLDivElement>(null);
  const elementImageInputRef = useRef<HTMLInputElement>(null);
  const elementImageTargetRef = useRef<string | null>(null);
  const elementImagePreviewUrlsRef = useRef<string[]>([]);
  const blocksLoadedRef = useRef(false);
  const propertyHistoryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const propertyHistoryRecordedRef = useRef(false);
  const lastHistoryDesignIdRef = useRef<string | null>(null);
  const dragHistoryRecordedRef = useRef(false);
  const { canUndo, resetHistory, recordHistory, undo } = useCanvasHistory();
  const parchiPerPage = design?.parchiPerPage ?? 1;

  const canvas = design?.canvas;
  const primarySelectedId = selectedIds.length > 0 ? selectedIds[selectedIds.length - 1] : null;
  const selected = canvas?.elements.find((el) => el.id === primarySelectedId) ?? null;
  const selectedElements = useMemo(
    () => (canvas?.elements.filter((el) => selectedIds.includes(el.id)) ?? []),
    [canvas?.elements, selectedIds]
  );

  const handleSelect = useCallback((id: string | null, options?: { additive?: boolean }) => {
    if (id === null) {
      setSelectedIds([]);
      return;
    }
    if (options?.additive) {
      setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
      return;
    }
    setSelectedIds([id]);
  }, []);
  const canvasDesigns = useMemo(
    () => designs.filter((d) => d.layoutMode === 'canvas' && d.canvas),
    [designs]
  );

  const loadDesigns = useCallback(async () => {
    setLoading(true);
    try {
      const { response, data } = await fetchJson<{ designs: VoterParchiDesign[] }>(
        `/api/voter-parchi/designs?halkaName=${encodeURIComponent(normalizedHalka)}`
      );
      if (!response.ok) throw new Error('Failed to load designs');
      const list = data.designs ?? [];
      setDesigns(list);
      const canvasOnly = list.filter((d) => d.layoutMode === 'canvas' && d.canvas);
      setDesign(canvasOnly[0] ?? null);
      setDirty(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load designs');
    } finally {
      setLoading(false);
    }
  }, [normalizedHalka]);

  useEffect(() => {
    loadDesigns();
  }, [loadDesigns]);

  const loadBlockCodes = useCallback(async () => {
    setLoadingBlocks(true);
    try {
      const params = new URLSearchParams({ halkaName: normalizedHalka });
      const res = await fetch(`/api/constituency/overview?${params.toString()}`);
      const data = (await res.json()) as { blockCodes?: string[]; error?: string };
      if (!res.ok) throw new Error(data.error || 'Failed to load block codes');
      const codes = (data.blockCodes ?? []).map(String).sort();
      setBlockCodes(codes);
      setSelectedBlockCode((prev) => (prev && codes.includes(prev) ? prev : codes[0] ?? ''));
    } catch (error) {
      console.error(error);
      setBlockCodes([]);
    } finally {
      setLoadingBlocks(false);
    }
  }, [normalizedHalka]);

  const loadPreviewVoters = useCallback(async (blockCode: string, limit: number, signal?: AbortSignal) => {
    if (!blockCode) {
      setPreviewVoters([]);
      return;
    }

    setLoadingPreviewVoters(true);
    try {
      const params = new URLSearchParams({
        halkaName: normalizedHalka,
        blockCode,
        limit: String(limit),
      });
      const res = await fetch(`/api/voter-parchi/preview-voters?${params.toString()}`, { signal });
      const data = (await res.json()) as { voters?: ParchiVoterRecord[]; error?: string };
      if (!res.ok) throw new Error(data.error || 'Failed to load voters');
      setPreviewVoters(data.voters ?? []);
    } catch (error) {
      if (signal?.aborted) return;
      console.error(error);
      setPreviewVoters([]);
    } finally {
      if (!signal?.aborted) {
        setLoadingPreviewVoters(false);
      }
    }
  }, [normalizedHalka]);

  useEffect(() => {
    if (loading || blocksLoadedRef.current) return;
    blocksLoadedRef.current = true;
    void loadBlockCodes();
  }, [loading, loadBlockCodes]);

  useEffect(() => {
    if (!selectedBlockCode) return;
    const controller = new AbortController();
    void loadPreviewVoters(selectedBlockCode, parchiPerPage, controller.signal);
    return () => controller.abort();
  }, [selectedBlockCode, parchiPerPage, loadPreviewVoters]);

  useEffect(() => {
    blocksLoadedRef.current = false;
  }, [normalizedHalka]);

  useEffect(() => {
    return () => {
      elementImagePreviewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      elementImagePreviewUrlsRef.current = [];
    };
  }, []);

  const filteredBlockCodes = useMemo(() => {
    const q = blockSearch.trim().toLowerCase();
    if (!q) return blockCodes;
    return blockCodes.filter((code) => code.toLowerCase().includes(q));
  }, [blockCodes, blockSearch]);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) return;
    try {
      const user = JSON.parse(userStr) as { role?: string };
      setIsAdmin(user.role === 'admin');
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => {
      setFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await shellRef.current?.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      toast.error('Fullscreen is not available in this browser');
    }
  };

  const downloadPreviewPdf = async () => {
    if (!design?._id || !design.canvas) return;
    if (!selectedBlockCode) {
      toast.error('Select a block code for preview PDF');
      return;
    }
    setGeneratingPdf(true);
    try {
      if (dirty && isAdmin) {
        await saveDesign(true);
      }
      const size = resolveSlipSizeMm(design.canvas);
      const res = await fetch(`/api/voter-parchi/designs/${design._id}/preview-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canvas: design.canvas,
          parchiPerPage: design.parchiPerPage,
          symbolAssetId: design.symbolAssetId,
          photoAssetId: design.photoAssetId,
          slipWidthMm: size.widthMm,
          slipHeightMm: size.heightMm,
          blockCode: selectedBlockCode,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'PDF generation failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      const safeBlock = selectedBlockCode.replace(/\D/g, '') || selectedBlockCode;
      anchor.download = `${normalizedHalka}-${safeBlock}-parchi-preview.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success(`Preview PDF downloaded (${selectedBlockCode})`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'PDF download failed');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const saveDesign = useCallback(async (silent = false) => {
    if (!design?._id || !design.canvas) return;
    setSaving(true);
    try {
      const { response, data } = await fetchJson<{ design: VoterParchiDesign }>(`/api/voter-parchi/designs/${design._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: design.name,
          layoutMode: 'canvas',
          parchiPerPage: design.parchiPerPage,
          canvas: design.canvas,
          symbolAssetId: design.symbolAssetId,
          photoAssetId: design.photoAssetId,
          isDefault: design.isDefault,
        }),
      });
      if (!response.ok) throw new Error('Save failed');
      setDesign((prev) =>
        prev
          ? {
              ...prev,
              name: data.design.name,
              updatedAt: data.design.updatedAt,
            }
          : data.design
      );
      setDesigns((prev) => prev.map((d) => (d._id === data.design._id ? { ...d, name: data.design.name, updatedAt: data.design.updatedAt } : d)));
      setDirty(false);
      if (!silent) toast.success('Design saved');
    } catch (error) {
      if (!silent) toast.error(error instanceof Error ? error.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [design]);

  useEffect(() => {
    if (!dirty || !isAdmin) return;
    const timer = window.setTimeout(() => {
      void saveDesign(true);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [dirty, isAdmin, saveDesign]);

  useEffect(() => {
    if (!design?.canvas || !design._id) return;
    if (lastHistoryDesignIdRef.current === design._id) return;
    lastHistoryDesignIdRef.current = design._id;
    resetHistory(design.canvas);
  }, [design?._id, design?.canvas, resetHistory]);

  const handleUndo = useCallback(() => {
    if (!design?.canvas) return;
    const snapshot = undo();
    if (!snapshot) return;
    setDesign({
      ...design,
      canvas: { ...design.canvas, ...snapshot },
    });
    setDirty(true);
    setSelectedIds([]);
  }, [design, undo]);

  const handleCreateDesign = async (values: NewDesignFormValues) => {
    if (!isAdmin) {
      toast.error('Admin access required to create designs');
      return;
    }
    setCreatingDesign(true);
    try {
      const payload = createCanvasDesignFromTemplate({
        halkaName: normalizedHalka,
        name: values.name,
        templateId: values.templateId,
        widthMm: values.widthMm,
        heightMm: values.heightMm,
        parchiPerPage: values.parchiPerPage,
      });
      const { response, data } = await fetchJson<{ design: VoterParchiDesign }>('/api/voter-parchi/designs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error('Could not create design');
      setDesigns((prev) => [...prev, data.design]);
      setDesign(data.design);
      setDirty(false);
      setSelectedIds([]);
      lastHistoryDesignIdRef.current = null;
      setNewDesignOpen(false);
      toast.success('Design created — customize and save when ready');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create design');
    } finally {
      setCreatingDesign(false);
    }
  };

  const patchCanvas = (patch: Partial<NonNullable<VoterParchiDesign['canvas']>>, options?: { recordHistory?: boolean }) => {
    if (!design?.canvas) return;
    if (options?.recordHistory !== false) {
      recordHistory(design.canvas);
    }
    setDesign({ ...design, canvas: { ...design.canvas, ...patch } });
    setDirty(true);
  };

  const patchSlipSize = (widthMm: number, heightMm: number) => {
    const w = Math.max(20, Math.min(A4_WIDTH_MM, widthMm));
    const h = Math.max(20, Math.min(A4_HEIGHT_MM, heightMm));
    patchCanvas({
      slipWidthMm: w,
      slipHeightMm: h,
      slipAspectRatio: w / h,
    });
  };

  const slipSize = resolveSlipSizeMm(design?.canvas);

  const patchElements = (elements: ParchiCanvasElement[], options?: { recordHistory?: boolean }) => {
    patchCanvas({ elements }, options);
  };

  const handleDragStart = () => {
    if (!canvas || dragHistoryRecordedRef.current) return;
    recordHistory(canvas);
    dragHistoryRecordedRef.current = true;
  };

  const handleDragCommit = (elements: ParchiCanvasElement[]) => {
    dragHistoryRecordedRef.current = false;
    patchElements(elements, { recordHistory: false });
  };

  const addElement = (type: ParchiCanvasElementType, fieldId?: ParchiFieldId) => {
    if (!canvas) return;
    const maxZ = canvas.elements.reduce((m, el) => Math.max(m, el.zIndex), 0);
    const el = defaultElementForType(type, maxZ, fieldId);
    patchElements([...canvas.elements, el]);
    setSelectedIds([el.id]);
  };

  const addShape = (shape: ParchiShapePreset) => {
    if (!canvas) return;
    const maxZ = canvas.elements.reduce((m, el) => Math.max(m, el.zIndex), 0);
    const el = defaultShapeElement(shape, maxZ);
    patchElements([...canvas.elements, el]);
    setSelectedIds([el.id]);
  };

  const deleteSelected = useCallback(() => {
    if (!selectedIds.length || !canvas) return;
    patchElements(canvas.elements.filter((el) => !selectedIds.includes(el.id)));
    setSelectedIds([]);
  }, [selectedIds, canvas, patchElements]);

  const deleteElementById = useCallback(
    (elementId: string) => {
      if (!canvas) return;
      patchElements(canvas.elements.filter((el) => el.id !== elementId));
      setSelectedIds((prev) => prev.filter((id) => id !== elementId));
    },
    [canvas, patchElements]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const inInput =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT';

      if ((event.metaKey || event.ctrlKey) && event.key === 'z' && !event.shiftKey) {
        if (inInput) return;
        event.preventDefault();
        handleUndo();
        return;
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedIds.length > 0 && isAdmin) {
        if (inInput) return;
        event.preventDefault();
        deleteSelected();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, deleteSelected, selectedIds, isAdmin]);

  const duplicateSelected = () => {
    if (!selectedElements.length || !canvas) return;
    const maxZ = canvas.elements.reduce((m, el) => Math.max(m, el.zIndex), 0);
    const copies = selectedElements.map((el, index) => ({
      ...el,
      id: newCanvasElementId(),
      x: Math.min(el.x + 3, 90),
      y: Math.min(el.y + 3, 90),
      zIndex: maxZ + index + 1,
    }));
    patchElements([...canvas.elements, ...copies]);
    setSelectedIds(copies.map((copy) => copy.id));
  };

  const beginPropertyEdit = () => {
    if (!canvas || propertyHistoryRecordedRef.current) return;
    recordHistory(canvas);
    propertyHistoryRecordedRef.current = true;
    if (propertyHistoryTimerRef.current) {
      clearTimeout(propertyHistoryTimerRef.current);
    }
    propertyHistoryTimerRef.current = setTimeout(() => {
      propertyHistoryRecordedRef.current = false;
      propertyHistoryTimerRef.current = null;
    }, 800);
  };

  const patchSelected = (patch: Partial<ParchiCanvasElement>) => {
    if (!primarySelectedId || !canvas) return;
    beginPropertyEdit();
    patchElements(
      canvas.elements.map((el) => (el.id === primarySelectedId ? { ...el, ...patch } : el)),
      { recordHistory: false }
    );
  };

  const patchSelectedStyle = (stylePatch: Partial<ParchiCanvasElementStyle>) => {
    if (!selectedIds.length || !canvas) return;
    beginPropertyEdit();
    patchElements(
      canvas.elements.map((el) =>
        selectedIds.includes(el.id) ? { ...el, style: { ...el.style, ...stylePatch } } : el
      ),
      { recordHistory: false }
    );
  };

  const alignSelected = (mode: ElementAlignMode) => {
    if (!canvas || selectedIds.length < 2) return;
    recordHistory(canvas);
    patchElements(alignCanvasElements(canvas.elements, selectedIds, mode), { recordHistory: false });
  };

  const uploadBackground = async (file: File) => {
    if (!design?._id) return;
    setUploadingBg(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('role', 'background');
      form.append('name', file.name);
      const res = await fetch(`/api/voter-parchi/designs/${design._id}/assets`, {
        method: 'POST',
        body: form,
      });
      const data = (await res.json()) as { design?: VoterParchiDesign; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Upload failed');
      if (data.design) {
        setDesign(data.design);
        setDesigns((prev) => prev.map((d) => (d._id === data.design!._id ? data.design! : d)));
      }
      toast.success('Background uploaded');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setUploadingBg(false);
    }
  };

  const uploadAsset = async (file: File, role: 'symbol' | 'photo') => {
    if (!design?._id) return;
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('role', role);
      form.append('name', file.name);
      const res = await fetch(`/api/voter-parchi/designs/${design._id}/assets`, {
        method: 'POST',
        body: form,
      });
      const data = (await res.json()) as { design?: VoterParchiDesign; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Upload failed');
      if (data.design) {
        setDesign(data.design);
        setDesigns((prev) => prev.map((d) => (d._id === data.design!._id ? data.design! : d)));
        setDirty(true);
      }
      toast.success(`${role === 'symbol' ? 'Symbol' : 'Photo'} uploaded`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed');
    }
  };

  const clearElementImageUpload = useCallback((elementId: string) => {
    setElementImageUploads((prev) => {
      const next = { ...prev };
      const previewUrl = next[elementId]?.previewUrl;
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        elementImagePreviewUrlsRef.current = elementImagePreviewUrlsRef.current.filter((url) => url !== previewUrl);
      }
      delete next[elementId];
      return next;
    });
  }, []);

  const handleImageElementDoubleClick = useCallback(
    (elementId: string) => {
      if (!isAdmin || !design?._id) return;
      if (elementImageUploads[elementId]) return;
      elementImageTargetRef.current = elementId;
      const input = elementImageInputRef.current;
      if (!input) return;
      input.value = '';
      input.click();
    },
    [design?._id, elementImageUploads, isAdmin]
  );

  const handleElementImageFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    const elementId = elementImageTargetRef.current;
    elementImageTargetRef.current = null;
    if (!file || !elementId || !design?._id || !design.canvas) return;

    let previewUrl: string | undefined;
    try {
      setElementImageUploads((prev) => ({
        ...prev,
        [elementId]: { phase: 'preparing', progress: 8 },
      }));

      const prepared = await prepareParchiElementImage(file);
      previewUrl = URL.createObjectURL(prepared);
      elementImagePreviewUrlsRef.current.push(previewUrl);

      setElementImageUploads((prev) => ({
        ...prev,
        [elementId]: { phase: 'preparing', progress: 25, previewUrl },
      }));

      const data = await uploadDesignAssetWithProgress(design._id, prepared, {
        role: 'other',
        name: prepared.name,
        onProgress: (progress) => {
          setElementImageUploads((prev) => ({
            ...prev,
            [elementId]: {
              phase: 'uploading',
              progress: Math.max(30, progress),
              previewUrl,
            },
          }));
        },
      });

      const assetId = data.asset.id;
      const updatedElements = design.canvas.elements.map((el) =>
        el.id === elementId ? { ...el, assetId, imageFieldId: undefined } : el
      );
      const mergedDesign: VoterParchiDesign = {
        ...design,
        assets: data.design.assets as VoterParchiDesign['assets'],
        canvas: {
          ...design.canvas,
          elements: updatedElements,
        },
      };

      recordHistory(design.canvas);
      setDesign(mergedDesign);
      setDesigns((prev) => prev.map((d) => (d._id === mergedDesign._id ? mergedDesign : d)));
      setDirty(true);
      setSelectedIds([elementId]);
      clearElementImageUpload(elementId);
      toast.success('Image uploaded');

      if (mergedDesign._id && mergedDesign.canvas) {
        setSaving(true);
        try {
          const { response } = await fetchJson<{ design: VoterParchiDesign }>(
            `/api/voter-parchi/designs/${mergedDesign._id}`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: mergedDesign.name,
                layoutMode: 'canvas',
                parchiPerPage: mergedDesign.parchiPerPage,
                canvas: mergedDesign.canvas,
                symbolAssetId: mergedDesign.symbolAssetId,
                photoAssetId: mergedDesign.photoAssetId,
                isDefault: mergedDesign.isDefault,
              }),
            }
          );
          if (response.ok) setDirty(false);
        } catch {
          // autosave will retry
        } finally {
          setSaving(false);
        }
      }
    } catch (error) {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        elementImagePreviewUrlsRef.current = elementImagePreviewUrlsRef.current.filter((url) => url !== previewUrl);
      }
      clearElementImageUpload(elementId);
      toast.error(error instanceof Error ? error.message : 'Image upload failed');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-slate-500">
        <ArrowPathIcon className="mr-2 h-5 w-5 animate-spin" />
        Loading designer…
      </div>
    );
  }

  if (!design?.canvas) {
    return (
      <>
        <div className="mx-auto max-w-3xl space-y-8 px-4 py-16">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-slate-900">Voter Parchi Designer</h1>
            <p className="mt-2 text-slate-600">
              Create a custom voter slip design for {normalizedHalka}. Choose a template, set your slip size, then
              edit fields, photos, and layout.
            </p>
          </div>

          {isAdmin ? (
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                {
                  id: 'campaign-two-panel' as const,
                  title: 'Campaign two-panel',
                  blurb: 'ECP voter details + campaign photo and symbol',
                  size: '148×74 mm',
                },
                {
                  id: 'roll-box' as const,
                  title: 'Voter roll box',
                  blurb: 'Statistical code, CNIC, address, polling station',
                  size: '190×48 mm',
                },
                {
                  id: 'blank' as const,
                  title: 'Blank canvas',
                  blurb: 'Start empty with your own dimensions',
                  size: 'Custom size',
                },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setNewDesignOpen(true)}
                  className="rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-indigo-300 hover:shadow-md"
                >
                  <p className="font-semibold text-slate-900">{item.title}</p>
                  <p className="mt-1 text-sm text-slate-500">{item.blurb}</p>
                  <p className="mt-3 text-xs font-medium text-indigo-600">{item.size}</p>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-center text-sm text-amber-700">
              Ask an admin to create a canvas design for this constituency.
            </p>
          )}

          {isAdmin ? (
            <div className="text-center">
              <button
                type="button"
                onClick={() => setNewDesignOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white shadow-lg shadow-indigo-300/40 hover:bg-indigo-700"
              >
                <PlusIcon className="h-5 w-5" />
                Create new design
              </button>
            </div>
          ) : null}

          <div className="text-center">
            <Link
              href={constituencyHomePath(normalizedHalka)}
              className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800"
            >
              <ArrowLeftIcon className="h-4 w-4" />
              Back to constituency
            </Link>
          </div>
        </div>

        <NewDesignDialog
          open={newDesignOpen}
          halkaName={normalizedHalka}
          isCreating={creatingDesign}
          onOpenChange={setNewDesignOpen}
          onCreate={handleCreateDesign}
        />
      </>
    );
  }

  return (
    <div ref={shellRef} className="flex h-full flex-col bg-slate-100">
      {/* Top bar */}
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 shadow-sm sm:gap-3 sm:px-4">
        {!fullscreen ? (
          <Link
            href={constituencyHomePath(normalizedHalka)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            <span className="hidden sm:inline">{normalizedHalka}</span>
          </Link>
        ) : null}
        <div className="hidden h-5 w-px bg-slate-200 sm:block" />
        <h1 className="text-sm font-bold text-slate-900 sm:text-base">Parchi Designer</h1>
        <input
          type="text"
          value={design.name}
          disabled={!isAdmin}
          onChange={(e) => {
            setDesign({ ...design, name: e.target.value });
            setDirty(true);
          }}
          className="max-w-[140px] rounded-lg border border-slate-200 px-2 py-1 text-sm font-medium disabled:bg-slate-50 sm:max-w-[200px] sm:px-3 sm:py-1.5"
        />
        <div className="flex items-center gap-1 text-xs text-slate-500">
          {saving ? (
            <>
              <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" /> Saving…
            </>
          ) : dirty ? (
            'Unsaved'
          ) : (
            <>
              <CheckIcon className="h-3.5 w-3.5 text-emerald-600" /> Saved
            </>
          )}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5 sm:gap-2">
          <div className="flex min-w-[8rem] max-w-[11rem] flex-col sm:min-w-[10rem]">
            <label className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Preview block</label>
            <select
              value={selectedBlockCode}
              onChange={(e) => setSelectedBlockCode(e.target.value)}
              disabled={loadingBlocks && blockCodes.length === 0}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium sm:text-sm"
              title="Block code used for live preview and PDF download"
            >
              {loadingBlocks && blockCodes.length === 0 ? (
                <option value="">Loading blocks…</option>
              ) : blockCodes.length === 0 ? (
                <option value="">No blocks</option>
              ) : (
                blockCodes.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))
              )}
            </select>
          </div>
          {loadingPreviewVoters ? (
            <span className="hidden text-[10px] text-slate-400 sm:inline">
              <ArrowPathIcon className="inline h-3 w-3 animate-spin" /> Loading voters…
            </span>
          ) : previewVoters[0] ? (
            <span className="hidden max-w-[8rem] truncate text-[10px] text-slate-500 sm:inline" title={previewVoters[0].name}>
              {previewVoters[0].name}
            </span>
          ) : null}
          <select
            value={design.parchiPerPage}
            disabled={!isAdmin}
            onChange={(e) => {
              setDesign({ ...design, parchiPerPage: Number(e.target.value) });
              setDirty(true);
            }}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium sm:text-sm"
            title="Slips per A4 page"
          >
            {PAGE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}/A4{n === 4 ? ' (2×2)' : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setShowA4Guides((v) => !v)}
            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium sm:text-sm ${
              showA4Guides ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Squares2X2Icon className="h-4 w-4" />
            <span className="hidden sm:inline">A4 guides</span>
          </button>
          <button
            type="button"
            onClick={handleUndo}
            disabled={!canUndo || !isAdmin}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-40 sm:text-sm"
            title="Undo (Ctrl+Z)"
          >
            <ArrowUturnLeftIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Undo</span>
          </button>
          <button
            type="button"
            onClick={() => void downloadPreviewPdf()}
            disabled={generatingPdf || !selectedBlockCode}
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 sm:px-3 sm:text-sm"
          >
            {generatingPdf ? (
              <ArrowPathIcon className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowDownTrayIcon className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">{generatingPdf ? 'Generating…' : 'Download PDF'}</span>
            <span className="sm:hidden">PDF</span>
          </button>
          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 sm:text-sm"
            title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {fullscreen ? (
              <ArrowsPointingInIcon className="h-4 w-4" />
            ) : (
              <ArrowsPointingOutIcon className="h-4 w-4" />
            )}
          </button>
          {isAdmin ? (
            <>
              <button
                type="button"
                onClick={() => setNewDesignOpen(true)}
                className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 sm:text-sm"
              >
                <PlusIcon className="h-4 w-4" />
                <span className="hidden sm:inline">New design</span>
              </button>
              <button
                type="button"
                onClick={() => void saveDesign(false)}
                disabled={saving || !dirty}
                className="rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 sm:px-3 sm:text-sm"
              >
                Save
              </button>
            </>
          ) : null}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Left sidebar */}
        {leftOpen ? (
          <aside className="flex w-52 shrink-0 flex-col border-r border-slate-200 bg-white sm:w-56 lg:w-60">
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Toolbox</p>
              <button
                type="button"
                onClick={() => setLeftOpen(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                title="Hide toolbox"
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Add elements</p>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['labelValue', 'Field row'],
                ['field', 'Value only'],
                ['text', 'Text'],
                ['image', 'Image'],
              ] as const
            ).map(([type, label]) => (
              <button
                key={type}
                type="button"
                disabled={!isAdmin}
                onClick={() => addElement(type)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-xs font-semibold text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 disabled:opacity-50"
              >
                + {label}
              </button>
            ))}
          </div>

          <p className="mb-2 mt-4 text-xs font-bold uppercase tracking-wide text-slate-500">Shapes</p>
          <div className="grid grid-cols-3 gap-2">
            {(['box', 'rectangle', 'circle'] as const).map((shape) => (
              <ShapeToolboxButton
                key={shape}
                shape={shape}
                disabled={!isAdmin}
                onClick={() => addShape(shape)}
              />
            ))}
          </div>

          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Voter fields</p>
          <div className="max-h-32 space-y-0.5 overflow-y-auto lg:max-h-48">
            {PARCHI_FIELD_DEFINITIONS.filter((f) => !['symbol', 'photo', 'rowCrop'].includes(f.id)).map((field) => (
              <button
                key={field.id}
                type="button"
                disabled={!isAdmin}
                onClick={() => addElement('labelValue', field.id)}
                className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-indigo-50 disabled:opacity-50"
              >
                {field.labelUrdu ?? field.label}
              </button>
            ))}
          </div>

          <p className="mb-2 mt-4 text-xs font-bold uppercase tracking-wide text-slate-500">Assets</p>
          <div className="space-y-2">
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:border-indigo-400 hover:bg-indigo-50">
              <PhotoIcon className="h-4 w-4" />
              {uploadingBg ? 'Uploading…' : 'Background image'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={!isAdmin || uploadingBg}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadBackground(file);
                  e.target.value = '';
                }}
              />
            </label>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:border-indigo-400 hover:bg-indigo-50">
              <PhotoIcon className="h-4 w-4" />
              Candidate photo
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={!isAdmin}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadAsset(file, 'photo');
                  e.target.value = '';
                }}
              />
            </label>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:border-indigo-400 hover:bg-indigo-50">
              <PhotoIcon className="h-4 w-4" />
              Election symbol
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={!isAdmin}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadAsset(file, 'symbol');
                  e.target.value = '';
                }}
              />
            </label>
          </div>

          <p className="mb-2 mt-4 text-xs font-bold uppercase tracking-wide text-slate-500">Layers</p>
          <div className="max-h-36 space-y-0.5 overflow-y-auto">
            {sortCanvasElements(design.canvas.elements)
              .slice()
              .reverse()
              .map((el) => (
                <div
                  key={el.id}
                  className={`flex w-full items-center gap-1 rounded-md px-1 py-0.5 ${
                    selectedIds.includes(el.id) ? 'bg-indigo-100' : 'hover:bg-slate-100'
                  }`}
                >
                  <button
                    type="button"
                    onClick={(e) => handleSelect(el.id, { additive: e.shiftKey || e.metaKey || e.ctrlKey })}
                    className={`min-w-0 flex-1 truncate px-1 py-1 text-left text-xs ${
                      selectedIds.includes(el.id) ? 'text-indigo-900' : 'text-slate-700'
                    }`}
                  >
                    {el.type}
                    {el.fieldId ? ` · ${el.fieldId}` : ''}
                    <span className="ml-1 text-slate-400">z{el.zIndex}</span>
                  </button>
                  {isAdmin ? (
                    <button
                      type="button"
                      onClick={() => deleteElementById(el.id)}
                      className="shrink-0 rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600"
                      title="Delete layer"
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              ))}
          </div>
            </div>
          </aside>
        ) : (
          <button
            type="button"
            onClick={() => setLeftOpen(true)}
            className="flex w-8 shrink-0 flex-col items-center justify-center border-r border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-indigo-600"
            title="Show toolbox"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        )}

        <main className="relative min-h-0 min-w-0 flex-1 bg-[linear-gradient(180deg,#e2e8f0_0%,#cbd5e1_100%)]">
        <DesignerCanvas
          design={design}
          canvas={design.canvas}
          previewVoters={previewVoters}
          selectedIds={selectedIds}
          primarySelectedId={primarySelectedId}
          onSelect={handleSelect}
          onElementsChange={() => {}}
          onDragStart={isAdmin ? handleDragStart : undefined}
          onDragCommit={isAdmin ? handleDragCommit : undefined}
          onDeleteElement={isAdmin ? deleteElementById : undefined}
          onImageDoubleClick={isAdmin ? handleImageElementDoubleClick : undefined}
          elementImageUploads={elementImageUploads}
          editable={isAdmin}
          showA4Guides={showA4Guides}
          parchiPerPage={design.parchiPerPage}
        />
        </main>

        {/* Right properties */}
        {rightOpen ? (
          <aside className="flex w-56 shrink-0 flex-col border-l border-slate-200 bg-white sm:w-60 lg:w-64">
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Properties</p>
              <button
                type="button"
                onClick={() => setRightOpen(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                title="Hide properties"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {selected ? (
            <>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-bold text-slate-900">
                  {selectedIds.length > 1 ? `${selectedIds.length} elements` : 'Element'}
                </p>
                {isAdmin ? (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={duplicateSelected}
                      className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
                      title="Duplicate"
                    >
                      <DocumentDuplicateIcon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={deleteSelected}
                      className="rounded p-1.5 text-red-500 hover:bg-red-50"
                      title="Delete"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                ) : null}
              </div>

              {selectedIds.length >= 2 && isAdmin ? (
                <div className="mb-4">
                  <p className="mb-2 text-xs font-semibold text-slate-500">Align horizontally</p>
                  <div className="grid grid-cols-3 gap-1">
                    {(
                      [
                        ['left', 'Left'],
                        ['center', 'Center'],
                        ['right', 'Right'],
                      ] as const
                    ).map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => alignSelected(mode)}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] font-semibold text-slate-700 hover:border-indigo-300 hover:bg-indigo-50"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="space-y-3 text-sm">
                {selectedIds.length === 1 && (selected.type === 'field' || selected.type === 'labelValue' || selected.type === 'image') && (
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-500">Data field</span>
                    <select
                      value={selected.fieldId ?? selected.imageFieldId ?? ''}
                      disabled={!isAdmin}
                      onChange={(e) => {
                        const id = e.target.value as ParchiFieldId;
                        if (selected.type === 'image') patchSelected({ imageFieldId: id });
                        else patchSelected({ fieldId: id });
                      }}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5"
                    >
                      {PARCHI_FIELD_DEFINITIONS.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {selectedIds.length === 1 && selected.type === 'text' && (
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-500">Text</span>
                    <textarea
                      value={selected.text ?? ''}
                      disabled={!isAdmin}
                      onChange={(e) => patchSelected({ text: e.target.value })}
                      rows={3}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5"
                      dir="auto"
                    />
                  </label>
                )}

                {selectedIds.length === 1
                  ? ['x', 'y', 'w', 'h'].map((key) => (
                      <label key={key} className="block">
                        <span className="text-xs font-semibold uppercase text-slate-500">{key} %</span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.5}
                          disabled={!isAdmin}
                          value={selected[key as 'x' | 'y' | 'w' | 'h']}
                          onChange={(e) =>
                            patchSelected({ [key]: Number(e.target.value) } as Partial<ParchiCanvasElement>)
                          }
                          className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5"
                        />
                      </label>
                    ))
                  : null}

                {selectedIds.length === 1 ? (
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-500">Layer (z-index)</span>
                    <input
                      type="number"
                      disabled={!isAdmin}
                      value={selected.zIndex}
                      onChange={(e) => patchSelected({ zIndex: Number(e.target.value) })}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5"
                    />
                  </label>
                ) : null}

                <div>
                  <p className="mb-2 text-xs font-semibold text-slate-500">Style</p>
                  <ElementStyleControls
                    elements={selectedElements}
                    disabled={!isAdmin}
                    onStyleChange={patchSelectedStyle}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-3 text-sm text-slate-600">
              <p className="font-semibold text-slate-900">Canvas</p>
              <p>Click an element to edit. Shift/Cmd+click to multi-select. Drag to move, use handles to resize. Double-click image elements to upload (max 1 MB).</p>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Slip size (mm)</p>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-[10px] font-semibold text-slate-500">Width</span>
                    <input
                      type="number"
                      min={20}
                      max={A4_WIDTH_MM}
                      step={1}
                      disabled={!isAdmin}
                      value={Math.round(slipSize.widthMm)}
                      onChange={(e) => patchSlipSize(Number(e.target.value), slipSize.heightMm)}
                      className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-semibold text-slate-500">Height</span>
                    <input
                      type="number"
                      min={20}
                      max={A4_HEIGHT_MM}
                      step={1}
                      disabled={!isAdmin}
                      value={Math.round(slipSize.heightMm)}
                      onChange={(e) => patchSlipSize(slipSize.widthMm, Number(e.target.value))}
                      className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                    />
                  </label>
                </div>
                <p className="mt-2 text-[10px] text-slate-500">
                  A4 sheet: {A4_WIDTH_MM}×{A4_HEIGHT_MM} mm · {design.parchiPerPage} slips/page
                </p>
                <label className="mt-3 block">
                  <span className="text-[10px] font-semibold text-slate-500">Preview block code</span>
                  <input
                    type="text"
                    value={blockSearch}
                    onChange={(e) => setBlockSearch(e.target.value)}
                    placeholder="Search blocks…"
                    className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                  />
                  <select
                    value={selectedBlockCode}
                    onChange={(e) => setSelectedBlockCode(e.target.value)}
                    disabled={loadingBlocks || blockCodes.length === 0}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                  >
                    {(blockSearch.trim() ? filteredBlockCodes : blockCodes).map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                  {previewVoters[0] ? (
                    <p className="mt-1 text-[10px] text-slate-500">
                      Preview: {previewVoters[0].name} · {previewVoters.length} voter(s) loaded
                    </p>
                  ) : null}
                </label>
                {isAdmin ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {SLIP_SIZE_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => patchSlipSize(preset.widthMm, preset.heightMm)}
                        className="rounded-md bg-white px-2 py-1 text-[10px] font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-indigo-50 hover:text-indigo-800 hover:ring-indigo-200"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <label className="block">
                <span className="text-xs font-semibold text-slate-500">Page background color</span>
                <input
                  type="color"
                  disabled={!isAdmin}
                  value={design.canvas.backgroundColor ?? '#ffffff'}
                  onChange={(e) => patchCanvas({ backgroundColor: e.target.value })}
                  className="mt-1 h-9 w-full cursor-pointer rounded border border-slate-200"
                />
              </label>
              {canvasDesigns.length > 1 ? (
                <label className="block">
                  <span className="text-xs font-semibold text-slate-500">Switch design</span>
                  <select
                    value={design._id}
                    onChange={(e) => {
                      const next = canvasDesigns.find((d) => d._id === e.target.value);
                      if (next) setDesign(next);
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5"
                  >
                    {canvasDesigns.map((d) => (
                      <option key={d._id} value={d._id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
          )}
            </div>
          </aside>
        ) : (
          <button
            type="button"
            onClick={() => setRightOpen(true)}
            className="flex w-8 shrink-0 flex-col items-center justify-center border-l border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-indigo-600"
            title="Show properties"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      <NewDesignDialog
        open={newDesignOpen}
        halkaName={normalizedHalka}
        isCreating={creatingDesign}
        onOpenChange={setNewDesignOpen}
        onCreate={handleCreateDesign}
      />

      <input
        ref={elementImageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => void handleElementImageFileChange(e)}
      />
    </div>
  );
}
