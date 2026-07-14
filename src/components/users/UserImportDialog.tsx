'use client';

import { useEffect, useState } from 'react';
import { ArrowDownTrayIcon, ArrowUpTrayIcon, DocumentArrowUpIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
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
import type { ConstituencyOption, ImportSummary } from './types';

interface UserImportDialogProps {
  open: boolean;
  constituencies: ConstituencyOption[];
  importConstituencyAccess: string;
  importSummary: ImportSummary | null;
  importErrors: string[];
  isImporting: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onOpenChange: (open: boolean) => void;
  onConstituencyChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function UserImportDialog({
  open,
  constituencies,
  importConstituencyAccess,
  importSummary,
  importErrors,
  isImporting,
  fileInputRef,
  onOpenChange,
  onConstituencyChange,
  onSubmit,
}: UserImportDialogProps) {
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState('');

  useEffect(() => {
    if (!open) setFileName('');
  }, [open]);

  const handleFile = (file: File | undefined) => {
    if (!file || !fileInputRef.current) return;
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fileInputRef.current.files = dataTransfer.files;
    setFileName(file.name);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 p-0 overflow-hidden">
        <DialogHeader className="border-b border-gray-100 px-6 py-5">
          <DialogTitle>Import users from spreadsheet</DialogTitle>
          <DialogDescription>
            Upload an Excel or CSV file with columns: name, email, password. Optional: role,
            constituency.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="px-6 py-5 space-y-5">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href="/api/users/import/sample">
                <ArrowDownTrayIcon className="mr-1.5 h-4 w-4" />
                Sample .xlsx
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href="/samples/user-import-sample.csv" download>
                <ArrowDownTrayIcon className="mr-1.5 h-4 w-4" />
                Sample .csv
              </a>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard/help/user-management">Import guide</Link>
            </Button>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="import-constituency">Default constituency (when row is blank)</Label>
            <Select value={importConstituencyAccess} onValueChange={onConstituencyChange}>
              <SelectTrigger id="import-constituency">
                <SelectValue placeholder="Select default constituency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_CONSTITUENCIES}>All constituencies</SelectItem>
                {constituencies.map((constituency) => (
                  <SelectItem key={constituency._id} value={constituency.halkaName}>
                    {constituency.halkaName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Spreadsheet file</Label>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                handleFile(e.dataTransfer.files?.[0]);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors',
                dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
              )}
            >
              <DocumentArrowUpIcon className="h-10 w-10 text-gray-400" />
              <p className="mt-3 text-sm font-medium text-gray-900">
                {fileName || 'Drop your file here, or click to browse'}
              </p>
              <p className="mt-1 text-xs text-gray-500">.xls, .xlsx, or .csv</p>
              <Input
                ref={fileInputRef}
                type="file"
                accept=".xls,.xlsx,.csv"
                className="hidden"
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')}
              />
            </div>
          </div>

          {importSummary ? (
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-emerald-50 p-4 text-sm sm:grid-cols-4">
              <div>
                <p className="text-xs text-emerald-600">Rows</p>
                <p className="font-semibold text-emerald-900">{importSummary.totalRows}</p>
              </div>
              <div>
                <p className="text-xs text-emerald-600">Created</p>
                <p className="font-semibold text-emerald-900">{importSummary.created}</p>
              </div>
              <div>
                <p className="text-xs text-emerald-600">Skipped</p>
                <p className="font-semibold text-emerald-900">{importSummary.skipped}</p>
              </div>
              <div>
                <p className="text-xs text-emerald-600">Errors</p>
                <p className="font-semibold text-emerald-900">{importSummary.errors}</p>
              </div>
            </div>
          ) : null}

          {importErrors.length > 0 ? (
            <div className="max-h-32 overflow-y-auto rounded-xl bg-red-50 p-4 text-sm text-red-800 space-y-1">
              {importErrors.map((error) => (
                <p key={error}>{error}</p>
              ))}
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button type="submit" disabled={isImporting}>
              <ArrowUpTrayIcon className="mr-1.5 h-4 w-4" />
              {isImporting ? 'Importing...' : 'Import users'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
