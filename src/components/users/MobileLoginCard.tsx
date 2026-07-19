'use client';

import {
  ClipboardDocumentIcon,
  DevicePhoneMobileIcon,
  PencilSquareIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { BlockAccessDisplay } from '@/components/users/BlockAccessDisplay';
import { cn } from '@/lib/utils';

export interface MobileLoginRecord {
  _id: string;
  code: string;
  label: string;
  name?: string;
  phone?: string;
  address?: string;
  comments?: string;
  halkaName: string;
  active: boolean;
  selectAllBlockCodes?: boolean;
  blockCodes?: string[];
  lastUsedAt?: string | null;
  parchiDesignId?: string | null;
  parchiDesignName?: string | null;
  parchiDesignCode?: string | null;
  parchiDesignIsDefault?: boolean;
}

interface MobileLoginCardProps {
  code: MobileLoginRecord;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: (active: boolean) => void;
}

function displayName(code: MobileLoginRecord) {
  return code.name?.trim() || code.label?.trim() || '—';
}

function formatDate(value?: string | null) {
  if (!value) return 'Never';
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatCode(value: string) {
  return value.split('').join(' ');
}

export function MobileLoginCard({ code, onEdit, onDelete, onToggleActive }: MobileLoginCardProps) {
  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code.code);
      toast.success('Login code copied');
    } catch {
      toast.error('Could not copy code');
    }
  };

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-1 gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <DevicePhoneMobileIcon className="h-6 w-6" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-gray-900">{displayName(code)}</h3>
              <Badge variant={code.active ? 'success' : 'secondary'}>
                {code.active ? 'Active' : 'Disabled'}
              </Badge>
              <Badge variant="outline">{code.halkaName}</Badge>
            </div>

            <button
              type="button"
              onClick={copyCode}
              className="mt-2 inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-1.5 font-mono text-lg tracking-[0.35em] text-white hover:bg-gray-800"
              title="Click to copy"
            >
              {formatCode(code.code)}
              <ClipboardDocumentIcon className="h-4 w-4 tracking-normal opacity-70" />
            </button>

            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Phone</p>
                <p className="text-gray-800">{code.phone || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Address</p>
                <p className="truncate text-gray-800" title={code.address || ''}>
                  {code.address || '—'}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Comments</p>
                <p className="truncate text-gray-800" title={code.comments || ''}>
                  {code.comments || '—'}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  Voter parchi design
                </p>
                <p className="truncate text-gray-800" title={code.parchiDesignName || ''}>
                  {code.parchiDesignName || 'Default'}
                  {code.parchiDesignCode ? (
                    <span className="text-gray-500"> ({code.parchiDesignCode})</span>
                  ) : null}
                  {code.parchiDesignIsDefault ? (
                    <span className="text-gray-400"> · halka default</span>
                  ) : null}
                </p>
              </div>
            </div>

            <div className="mt-3">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Block access</p>
              <div className="mt-1.5">
                <BlockAccessDisplay access={code} workerName={displayName(code)} />
              </div>
            </div>

            <p className="mt-2 text-xs text-gray-400">Last used {formatDate(code.lastUsedAt)}</p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 lg:flex-col lg:items-end">
          <div className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-2">
            <span className="text-xs text-gray-500">Enabled</span>
            <Switch
              checked={code.active}
              onCheckedChange={onToggleActive}
              aria-label={`Toggle login ${code.code}`}
            />
          </div>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" onClick={onEdit}>
              <PencilSquareIcon className="mr-1 h-4 w-4" />
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn('text-red-600 hover:bg-red-50 hover:text-red-700')}
              onClick={onDelete}
            >
              <TrashIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
