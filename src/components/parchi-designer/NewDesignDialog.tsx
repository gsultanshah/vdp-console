'use client';

import { useEffect, useState } from 'react';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
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
import {
  A4_HEIGHT_MM,
  A4_WIDTH_MM,
} from '@/lib/voter-parchi/canvas-layout';
import {
  PARCHI_TEMPLATE_CATALOG,
  type ParchiTemplateId,
} from '@/lib/voter-parchi/canvas-templates';
import { cn } from '@/lib/utils';

const PAGE_OPTIONS = [1, 2, 3, 4, 5];

export interface NewDesignFormValues {
  name: string;
  templateId: ParchiTemplateId;
  widthMm: number;
  heightMm: number;
  parchiPerPage: number;
}

interface NewDesignDialogProps {
  open: boolean;
  halkaName: string;
  isCreating?: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (values: NewDesignFormValues) => void | Promise<void>;
}

function clampMm(value: number, max: number): number {
  return Math.max(20, Math.min(max, value));
}

export default function NewDesignDialog({
  open,
  halkaName,
  isCreating = false,
  onOpenChange,
  onCreate,
}: NewDesignDialogProps) {
  const [templateId, setTemplateId] = useState<ParchiTemplateId>('campaign-two-panel');
  const [name, setName] = useState('');
  const [widthMm, setWidthMm] = useState(148);
  const [heightMm, setHeightMm] = useState(74);
  const [parchiPerPage, setParchiPerPage] = useState(4);

  useEffect(() => {
    if (!open) return;
    const template = PARCHI_TEMPLATE_CATALOG.find((t) => t.id === templateId) ?? PARCHI_TEMPLATE_CATALOG[0];
    setName((prev) => prev || `${halkaName} ${template.name}`);
    setWidthMm(template.defaultWidthMm);
    setHeightMm(template.defaultHeightMm);
    setParchiPerPage(template.defaultParchiPerPage);
  }, [open, templateId, halkaName]);

  const handleTemplateSelect = (id: ParchiTemplateId) => {
    setTemplateId(id);
    const template = PARCHI_TEMPLATE_CATALOG.find((t) => t.id === id);
    if (!template) return;
    setWidthMm(template.defaultWidthMm);
    setHeightMm(template.defaultHeightMm);
    setParchiPerPage(template.defaultParchiPerPage);
    setName(`${halkaName} ${template.name}`);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    await onCreate({
      name: trimmed,
      templateId,
      widthMm: clampMm(widthMm, A4_WIDTH_MM),
      heightMm: clampMm(heightMm, A4_HEIGHT_MM),
      parchiPerPage,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-slate-100 px-6 py-5">
          <DialogTitle>New voter parchi design</DialogTitle>
          <DialogDescription>
            Pick a starter template, set a custom slip size in millimeters, then customize and save your own design.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5 px-6 py-5">
          <div className="grid gap-3 sm:grid-cols-3">
            {PARCHI_TEMPLATE_CATALOG.map((template) => {
              const selected = template.id === templateId;
              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => handleTemplateSelect(template.id)}
                  className={cn(
                    'rounded-xl border-2 p-3 text-left transition',
                    selected
                      ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  )}
                >
                  <div
                    className={cn(
                      'mb-2 flex h-16 items-center justify-center rounded-lg bg-gradient-to-br text-[10px] font-bold uppercase tracking-wide text-white',
                      template.accentClass
                    )}
                  >
                    {template.id === 'campaign-two-panel' && (
                      <div className="flex h-12 w-[90%] overflow-hidden rounded border border-white/30">
                        <div className="w-1/2 bg-white/20" />
                        <div className="w-1/2 bg-white/10" />
                      </div>
                    )}
                    {template.id === 'roll-box' && (
                      <div className="flex h-8 w-[90%] flex-col overflow-hidden rounded border border-white/40">
                        <div className="flex h-1/2 border-b border-white/30">
                          <div className="w-1/2 border-r border-white/30" />
                          <div className="w-1/2" />
                        </div>
                        <div className="h-1/4 border-b border-white/30" />
                        <div className="h-1/4" />
                      </div>
                    )}
                    {template.id === 'blank' && (
                      <div className="h-12 w-[90%] rounded border-2 border-dashed border-white/50" />
                    )}
                  </div>
                  <p className="text-sm font-semibold text-slate-900">{template.name}</p>
                  <p className="mt-1 text-xs leading-snug text-slate-500">{template.description}</p>
                  <p className="mt-2 text-[10px] font-medium text-slate-400">
                    {template.defaultWidthMm}×{template.defaultHeightMm} mm · {template.defaultParchiPerPage}/A4
                  </p>
                </button>
              );
            })}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2 grid gap-2">
              <Label htmlFor="design-name">Design name</Label>
              <Input
                id="design-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. LA39 Campaign Parchi"
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="slip-width">Width (mm)</Label>
              <Input
                id="slip-width"
                type="number"
                min={20}
                max={A4_WIDTH_MM}
                step={1}
                value={widthMm}
                onChange={(e) => setWidthMm(Number(e.target.value))}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="slip-height">Height (mm)</Label>
              <Input
                id="slip-height"
                type="number"
                min={20}
                max={A4_HEIGHT_MM}
                step={1}
                value={heightMm}
                onChange={(e) => setHeightMm(Number(e.target.value))}
                required
              />
            </div>

            <div className="sm:col-span-2 grid gap-2">
              <Label htmlFor="parchi-per-page">Slips per A4 page</Label>
              <select
                id="parchi-per-page"
                value={parchiPerPage}
                onChange={(e) => setParchiPerPage(Number(e.target.value))}
                className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
              >
                {PAGE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n} per page{n === 4 ? ' (2×2 grid)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <p className="text-xs text-slate-500">
            Slip size: {clampMm(widthMm, A4_WIDTH_MM)}×{clampMm(heightMm, A4_HEIGHT_MM)} mm (max {A4_WIDTH_MM}×
            {A4_HEIGHT_MM} mm). You can resize later in the designer.
          </p>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isCreating}>
              Cancel
            </Button>
            <Button type="submit" disabled={isCreating || !name.trim()}>
              {isCreating ? (
                <>
                  <ArrowPathIcon className="mr-2 h-4 w-4 animate-spin" />
                  Creating…
                </>
              ) : (
                'Create design'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
