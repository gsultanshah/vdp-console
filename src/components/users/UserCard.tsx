'use client';

import { useState } from 'react';
import {
  ClipboardDocumentIcon,
  EyeIcon,
  EyeSlashIcon,
  PencilSquareIcon,
  ShieldCheckIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { UserRecord } from './types';
import {
  avatarColor,
  formatConstituencyAccess,
  formatDate,
  isDeletable,
  userInitials,
} from './user-utils';

interface UserCardProps {
  user: UserRecord;
  selected: boolean;
  onSelect: (shiftKey: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function UserCard({ user, selected, onSelect, onEdit, onDelete }: UserCardProps) {
  const [showPassword, setShowPassword] = useState(false);
  const deletable = isDeletable(user);

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(user.password);
      toast.success('Password copied');
    } catch {
      toast.error('Could not copy password');
    }
  };

  return (
    <div
      className={cn(
        'group relative rounded-xl border bg-white p-4 transition-all hover:shadow-md',
        selected ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-gray-100 hover:border-gray-200'
      )}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          disabled={!deletable}
          onChange={() => onSelect(false)}
          onClick={(e) => {
            if (e.shiftKey) {
              e.preventDefault();
              onSelect(true);
            }
          }}
          className="mt-3 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-40"
          aria-label={`Select ${user.name}`}
        />

        <div
          className={cn(
            'flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold',
            avatarColor(user.name)
          )}
        >
          {userInitials(user.name)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-base font-semibold text-gray-900">{user.name}</h3>
                {user.role === 'admin' ? (
                  <Badge className="bg-violet-100 text-violet-700 hover:bg-violet-100">
                    <ShieldCheckIcon className="mr-1 h-3 w-3" />
                    Admin
                  </Badge>
                ) : (
                  <Badge variant="secondary">Team member</Badge>
                )}
              </div>
              <p className="mt-0.5 truncate text-sm text-gray-500">{user.email}</p>
            </div>

            <div className="flex shrink-0 gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit} title="Edit user">
                <PencilSquareIcon className="h-4 w-4" />
              </Button>
              {deletable ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={onDelete}
                  title="Delete user"
                >
                  <TrashIcon className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg bg-gray-50 px-3 py-2">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Constituency</p>
              <p className="mt-0.5 text-sm font-medium text-gray-800">
                {formatConstituencyAccess(user.constituencyAccess)}
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 px-3 py-2">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Added</p>
              <p className="mt-0.5 text-sm font-medium text-gray-800">{formatDate(user.createdAt)}</p>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2 rounded-lg border border-dashed border-gray-200 bg-gray-50/50 px-3 py-2">
            <span className="text-xs font-medium text-gray-400">Password</span>
            <code className="flex-1 truncate text-sm text-gray-700">
              {showPassword ? user.password : '••••••••••'}
            </code>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setShowPassword((v) => !v)}
              title={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={copyPassword} title="Copy password">
              <ClipboardDocumentIcon className="h-4 w-4" />
            </Button>
          </div>

          {!deletable ? (
            <p className="mt-2 text-xs text-gray-400">Admin accounts are protected from deletion.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
