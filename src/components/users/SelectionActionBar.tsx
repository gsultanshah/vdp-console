import { TrashIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/button';

interface SelectionActionBarProps {
  count: number;
  onClear: () => void;
  onDelete: () => void;
}

export function SelectionActionBar({ count, onClear, onDelete }: SelectionActionBarProps) {
  if (count === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4 pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-xl shadow-gray-200/60">
        <span className="text-sm font-medium text-gray-700">
          {count} selected
        </span>
        <Button variant="outline" size="sm" onClick={onClear}>
          <XMarkIcon className="mr-1 h-4 w-4" />
          Clear
        </Button>
        <Button variant="destructive" size="sm" onClick={onDelete}>
          <TrashIcon className="mr-1 h-4 w-4" />
          Delete selected
        </Button>
      </div>
    </div>
  );
}
