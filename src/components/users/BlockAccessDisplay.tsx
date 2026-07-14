'use client';

import { useMemo, useState } from 'react';
import { Squares2X2Icon } from '@heroicons/react/24/outline';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { MAX_MOBILE_ACCESS_BLOCK_CODES } from '@/lib/mobile/block-access';

const PREVIEW_COUNT = 2;

export interface BlockAccessInfo {
  selectAllBlockCodes?: boolean;
  blockCodes?: string[];
}

interface BlockAccessDisplayProps {
  access: BlockAccessInfo;
  workerName?: string;
  className?: string;
}

export function getBlockAccessSummary(access: BlockAccessInfo) {
  if (access.selectAllBlockCodes !== false) {
    return { kind: 'all' as const, count: 0, codes: [] as string[] };
  }
  const codes = access.blockCodes ?? [];
  if (codes.length === 0) {
    return { kind: 'none' as const, count: 0, codes: [] as string[] };
  }
  return { kind: 'selected' as const, count: codes.length, codes };
}

export function BlockAccessDisplay({ access, workerName, className }: BlockAccessDisplayProps) {
  const [open, setOpen] = useState(false);
  const summary = getBlockAccessSummary(access);

  if (summary.kind === 'all') {
    return (
      <Badge variant="secondary" className="bg-sky-50 text-sky-700 hover:bg-sky-50 font-medium">
        All blocks
      </Badge>
    );
  }

  if (summary.kind === 'none') {
    return (
      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
        No blocks
      </Badge>
    );
  }

  const preview = summary.codes.slice(0, PREVIEW_COUNT);
  const remaining = summary.count - preview.length;

  return (
    <>
      <div className={className}>
        <div className="flex flex-wrap items-center gap-1.5">
          {preview.map((code) => (
            <span
              key={code}
              className="inline-flex rounded-md bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-700"
            >
              {code}
            </span>
          ))}
          {remaining > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setOpen(true)}
            >
              +{remaining} more
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-gray-500"
              onClick={() => setOpen(true)}
            >
              View
            </Button>
          )}
        </div>
        <p className="mt-1 text-xs text-gray-500">
          {summary.count} of {MAX_MOBILE_ACCESS_BLOCK_CODES} blocks
        </p>
      </div>

      <BlockCodesDialog
        open={open}
        onOpenChange={setOpen}
        codes={summary.codes}
        title={workerName ? `Block access — ${workerName}` : 'Block access'}
      />
    </>
  );
}

interface BlockCodesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  codes: string[];
  title: string;
}

export function BlockCodesDialog({ open, onOpenChange, codes, title }: BlockCodesDialogProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return codes;
    return codes.filter((code) => code.toLowerCase().includes(q));
  }, [codes, query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 p-0 overflow-hidden">
        <DialogHeader className="border-b border-gray-100 px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <Squares2X2Icon className="h-5 w-5 text-indigo-600" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {codes.length} block {codes.length === 1 ? 'code' : 'codes'} assigned (max{' '}
            {MAX_MOBILE_ACCESS_BLOCK_CODES})
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4 space-y-3">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search block codes..."
          />
          <div className="max-h-72 overflow-y-auto rounded-xl border border-gray-100 bg-gray-50 p-3">
            {filtered.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500">No matching block codes.</p>
            ) : (
              <div className="grid gap-1.5 sm:grid-cols-2">
                {filtered.map((code) => (
                  <div
                    key={code}
                    className="rounded-md bg-white px-2.5 py-1.5 font-mono text-sm text-gray-800 shadow-sm"
                  >
                    {code}
                  </div>
                ))}
              </div>
            )}
          </div>
          <p className="text-xs text-gray-400">
            Showing {filtered.length} of {codes.length}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
