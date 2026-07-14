import {
  ArrowUpTrayIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  QuestionMarkCircleIcon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { RoleFilter } from './types';

interface UsersToolbarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  roleFilter: RoleFilter;
  onRoleFilterChange: (value: RoleFilter) => void;
  resultCount: number;
  onAddUser: () => void;
  onImport: () => void;
}

const roleFilters: Array<{ id: RoleFilter; label: string }> = [
  { id: 'all', label: 'Everyone' },
  { id: 'user', label: 'Team members' },
  { id: 'admin', label: 'Admins' },
];

export function UsersToolbar({
  searchQuery,
  onSearchChange,
  roleFilter,
  onRoleFilterChange,
  resultCount,
  onAddUser,
  onImport,
}: UsersToolbarProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative flex-1 max-w-xl">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by name, email, or constituency..."
            className="h-11 pl-10 bg-white"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild className="h-10">
            <Link href="/dashboard/help/user-management">
              <QuestionMarkCircleIcon className="mr-1.5 h-4 w-4" />
              Help
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={onImport} className="h-10">
            <ArrowUpTrayIcon className="mr-1.5 h-4 w-4" />
            Import
          </Button>
          <Button size="sm" onClick={onAddUser} className="h-10">
            <PlusIcon className="mr-1.5 h-4 w-4" />
            Add user
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
          {roleFilters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => onRoleFilterChange(filter.id)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                roleFilter === filter.id
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <p className="text-sm text-gray-500">
          {resultCount} {resultCount === 1 ? 'person' : 'people'}
        </p>
      </div>
    </div>
  );
}
