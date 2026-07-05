'use client';

import { useMemo, useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';

export interface ReportsTableColumn<T> {
  key: string;
  label: string;
  align?: 'left' | 'right';
  sortable?: boolean;
  render: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number;
  exportValue?: (row: T) => string | number;
}

interface ReportsDataTableProps<T> {
  title: string;
  subtitle?: string;
  rows: T[];
  columns: ReportsTableColumn<T>[];
  searchPlaceholder?: string;
  searchFilter?: (row: T, query: string) => boolean;
  pageSize?: number;
  onExport?: () => void;
  emptyMessage?: string;
}

function formatCell(value: string | number): string {
  return typeof value === 'number' ? value.toLocaleString() : value;
}

export default function ReportsDataTable<T>({
  title,
  subtitle,
  rows,
  columns,
  searchPlaceholder = 'Search…',
  searchFilter,
  pageSize = 25,
  onExport,
  emptyMessage = 'No data to display',
}: ReportsDataTableProps<T>) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !searchFilter) {
      return rows;
    }
    return rows.filter((row) => searchFilter(row, q));
  }, [rows, query, searchFilter]);

  const sorted = useMemo(() => {
    if (!sortKey) {
      return filtered;
    }
    const column = columns.find((col) => col.key === sortKey);
    if (!column?.sortValue) {
      return filtered;
    }
    return [...filtered].sort((a, b) => {
      const av = column.sortValue!(a);
      const bv = column.sortValue!(b);
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
  }, [filtered, sortKey, sortDir, columns]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const toggleSort = (key: string, sortable?: boolean) => {
    if (!sortable) {
      return;
    }
    if (sortKey === key) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <div>
          <h3 className="font-bold text-slate-900">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {searchFilter ? (
            <div className="relative">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                placeholder={searchPlaceholder}
                className="w-56 rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          ) : null}
          {onExport ? (
            <button
              type="button"
              onClick={onExport}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Export CSV
            </button>
          ) : null}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50/80">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={`px-4 py-3 font-semibold text-slate-600 ${
                    column.align === 'right' ? 'text-right' : 'text-left'
                  } ${column.sortable ? 'cursor-pointer select-none hover:text-slate-900' : ''}`}
                  onClick={() => toggleSort(column.key, column.sortable)}
                >
                  <span className="inline-flex items-center gap-1">
                    {column.label}
                    {column.sortable && sortKey === column.key ? (
                      sortDir === 'asc' ? (
                        <ChevronUpIcon className="h-4 w-4" />
                      ) : (
                        <ChevronDownIcon className="h-4 w-4" />
                      )
                    ) : null}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 bg-white">
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-slate-500">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              pageRows.map((row, index) => (
                <tr key={index} className="transition hover:bg-indigo-50/30">
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={`whitespace-nowrap px-4 py-3 text-slate-700 ${
                        column.align === 'right' ? 'text-right tabular-nums' : 'text-left'
                      }`}
                    >
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 text-sm text-slate-500">
        <span>
          {sorted.length.toLocaleString()} row{sorted.length !== 1 ? 's' : ''}
          {query ? ` matching "${query}"` : ''}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-md border border-slate-200 px-3 py-1 disabled:opacity-40"
          >
            Prev
          </button>
          <span>
            Page {currentPage} / {totalPages}
          </span>
          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-md border border-slate-200 px-3 py-1 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

export function exportTableCsv<T>(
  filename: string,
  rows: T[],
  columns: ReportsTableColumn<T>[]
) {
  const header = columns.map((col) => col.label).join(',');
  const body = rows
    .map((row) =>
      columns
        .map((col) => {
          const value = col.exportValue
            ? col.exportValue(row)
            : String(col.render(row) ?? '');
          const escaped = String(value).replace(/"/g, '""');
          return `"${escaped}"`;
        })
        .join(',')
    )
    .join('\n');

  const blob = new Blob([`${header}\n${body}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export { formatCell };
