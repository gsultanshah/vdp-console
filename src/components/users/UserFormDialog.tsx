'use client';

import { ShieldCheckIcon, UserIcon } from '@heroicons/react/24/outline';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ALL_CONSTITUENCIES } from '@/lib/user-management';
import { cn } from '@/lib/utils';
import type { ConstituencyOption, UserFormState } from './types';

interface UserFormDialogProps {
  open: boolean;
  mode: 'create' | 'edit';
  form: UserFormState;
  constituencies: ConstituencyOption[];
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (form: UserFormState) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function UserFormDialog({
  open,
  mode,
  form,
  constituencies,
  isSaving,
  onOpenChange,
  onChange,
  onSubmit,
}: UserFormDialogProps) {
  const isEdit = mode === 'edit';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 p-0 overflow-hidden">
        <DialogHeader className="border-b border-gray-100 px-6 py-5">
          <DialogTitle>{isEdit ? 'Edit user' : 'Add a new user'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update account details and access. Share the password with your team member.'
              : 'Create a web console login for a campaign manager or data team member.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="px-6 py-5 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2 grid gap-2">
              <Label htmlFor="user-name">Full name</Label>
              <Input
                id="user-name"
                value={form.name}
                onChange={(e) => onChange({ ...form, name: e.target.value })}
                placeholder="e.g. Ahmed Khan"
                autoFocus
              />
            </div>

            <div className="sm:col-span-2 grid gap-2">
              <Label htmlFor="user-email">Email</Label>
              <Input
                id="user-email"
                type="email"
                value={form.email}
                onChange={(e) => onChange({ ...form, email: e.target.value })}
                placeholder="name@campaign.org"
              />
            </div>

            <div className="sm:col-span-2 grid gap-2">
              <Label htmlFor="user-password">Password</Label>
              <Input
                id="user-password"
                type="text"
                value={form.password}
                onChange={(e) => onChange({ ...form, password: e.target.value })}
                placeholder="Choose a password to share"
              />
              <p className="text-xs text-gray-500">
                This is stored as plain text so you can share credentials with your team.
              </p>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Role</Label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: 'user' as const, label: 'Team member', icon: UserIcon, hint: 'One constituency' },
                { value: 'admin' as const, label: 'Admin', icon: ShieldCheckIcon, hint: 'Full access' },
              ]).map((option) => {
                const Icon = option.icon;
                const active = form.role === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() =>
                      onChange({
                        ...form,
                        role: option.value,
                        constituencyAccess:
                          option.value === 'admin' ? ALL_CONSTITUENCIES : form.constituencyAccess,
                      })
                    }
                    className={cn(
                      'flex flex-col items-start rounded-xl border p-3 text-left transition-colors',
                      active
                        ? 'border-indigo-300 bg-indigo-50 ring-1 ring-indigo-200'
                        : 'border-gray-200 hover:border-gray-300'
                    )}
                  >
                    <Icon className={cn('h-5 w-5', active ? 'text-indigo-600' : 'text-gray-400')} />
                    <span className="mt-2 text-sm font-semibold text-gray-900">{option.label}</span>
                    <span className="text-xs text-gray-500">{option.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="user-constituency">Constituency access</Label>
            <Select
              value={form.role === 'admin' ? ALL_CONSTITUENCIES : form.constituencyAccess}
              disabled={form.role === 'admin'}
              onValueChange={(value) => onChange({ ...form, constituencyAccess: value })}
            >
              <SelectTrigger id="user-constituency">
                <SelectValue placeholder="Select constituency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_CONSTITUENCIES}>All constituencies</SelectItem>
                {constituencies.map((constituency) => (
                  <SelectItem key={constituency._id} value={constituency.halkaName}>
                    {constituency.halkaName}
                    {constituency.label ? ` — ${constituency.label}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.role === 'admin' ? (
              <p className="text-xs text-gray-500">Admins always have access to every constituency.</p>
            ) : null}
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? 'Saving...' : isEdit ? 'Save changes' : 'Create user'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
