import { UserPlusIcon } from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/button';
import type { UserRecord } from './types';
import { UserCard } from './UserCard';

interface UsersListProps {
  users: UserRecord[];
  selectedIds: Set<string>;
  isLoading: boolean;
  searchQuery: string;
  onSelect: (user: UserRecord, index: number, shiftKey: boolean) => void;
  onEdit: (user: UserRecord) => void;
  onDelete: (user: UserRecord) => void;
  onAddUser: () => void;
}

function UserCardSkeleton() {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 animate-pulse">
      <div className="flex gap-3">
        <div className="h-4 w-4 rounded bg-gray-100 mt-3" />
        <div className="h-12 w-12 rounded-full bg-gray-100" />
        <div className="flex-1 space-y-3">
          <div className="h-5 w-40 rounded bg-gray-100" />
          <div className="h-4 w-56 rounded bg-gray-100" />
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="h-14 rounded-lg bg-gray-50" />
            <div className="h-14 rounded-lg bg-gray-50" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function UsersList({
  users,
  selectedIds,
  isLoading,
  searchQuery,
  onSelect,
  onEdit,
  onDelete,
  onAddUser,
}: UsersListProps) {
  if (isLoading) {
    return (
      <div className="grid gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <UserCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 px-6 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
          <UserPlusIcon className="h-7 w-7" />
        </div>
        <h3 className="mt-4 text-lg font-semibold text-gray-900">
          {searchQuery.trim() ? 'No users match your search' : 'No users yet'}
        </h3>
        <p className="mt-2 max-w-sm text-sm text-gray-500">
          {searchQuery.trim()
            ? 'Try a different name, email, or constituency.'
            : 'Add your first team member or import a spreadsheet to get started.'}
        </p>
        {!searchQuery.trim() ? (
          <Button className="mt-6" onClick={onAddUser}>
            <UserPlusIcon className="mr-1.5 h-4 w-4" />
            Add your first user
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {users.map((user, index) => (
        <UserCard
          key={user._id}
          user={user}
          selected={selectedIds.has(user._id)}
          onSelect={(shiftKey) => onSelect(user, index, shiftKey)}
          onEdit={() => onEdit(user)}
          onDelete={() => onDelete(user)}
        />
      ))}
    </div>
  );
}
