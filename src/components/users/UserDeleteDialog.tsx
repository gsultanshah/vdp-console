import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { UserRecord } from './types';

interface UserDeleteDialogProps {
  open: boolean;
  users: UserRecord[];
  isDeleting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function UserDeleteDialog({
  open,
  users,
  isDeleting,
  onOpenChange,
  onConfirm,
}: UserDeleteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 sm:mx-0">
            <ExclamationTriangleIcon className="h-6 w-6 text-red-600" />
          </div>
          <DialogTitle className="pt-2">
            Delete {users.length} {users.length === 1 ? 'user' : 'users'}?
          </DialogTitle>
          <DialogDescription>
            They will be removed from the active list and won&apos;t be able to sign in. Account
            data is kept on file.
          </DialogDescription>
        </DialogHeader>

        <ul className="max-h-40 space-y-2 overflow-y-auto rounded-xl bg-gray-50 p-3">
          {users.map((user) => (
            <li key={user._id} className="text-sm">
              <span className="font-medium text-gray-900">{user.name}</span>
              <span className="text-gray-500"> · {user.email}</span>
            </li>
          ))}
        </ul>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={isDeleting} onClick={onConfirm}>
            {isDeleting ? 'Deleting...' : 'Delete users'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
