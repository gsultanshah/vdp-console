'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ConstituencyTableColumnSettings } from '@/lib/table-column-settings';
import { resolveVoterCells, type VoterTableCell } from '@/lib/voter-cells';
import type { VoterReproductionData } from '@/lib/voter-document';

interface VoterCellsPanelProps {
  halkaName: string;
  cnic: string;
  cells?: VoterTableCell[] | null;
  reproduction?: VoterReproductionData | null;
}

export default function VoterCellsPanel({
  halkaName,
  cnic,
  cells,
  reproduction,
}: VoterCellsPanelProps) {
  const [columnSettings, setColumnSettings] = useState<ConstituencyTableColumnSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      setIsLoading(true);
      try {
        const response = await fetch(
          `/api/constituency/table-columns?halkaName=${encodeURIComponent(halkaName)}`
        );
        const data = await response.json();
        if (!cancelled && response.ok) {
          setColumnSettings(data.tableColumnSettings ?? null);
        }
      } catch {
        if (!cancelled) {
          setColumnSettings(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, [halkaName]);

  const resolvedCells = useMemo(
    () => resolveVoterCells({ cells, reproduction, cnic }, columnSettings),
    [cells, reproduction, cnic, columnSettings]
  );

  const orderedCells = useMemo(() => {
    const settingsColumns = columnSettings?.columns ?? [];
    if (!settingsColumns.length) {
      return resolvedCells;
    }

    const byId = new Map(resolvedCells.map((cell) => [cell.id, cell]));
    const ordered = settingsColumns.map((column) => {
      const existing = byId.get(column.id);
      return (
        existing ?? {
          id: column.id,
          label: column.label,
          text: '',
        }
      );
    });

    for (const cell of resolvedCells) {
      if (!ordered.some((item) => item.id === cell.id)) {
        ordered.push(cell);
      }
    }

    return ordered;
  }, [resolvedCells, columnSettings]);

  if (isLoading && !resolvedCells.length) {
    return <p className="mt-4 text-sm text-gray-500">Loading table cells…</p>;
  }

  if (!orderedCells.length) {
    return null;
  }

  return (
    <div className="mt-4 border-t border-gray-200 pt-4">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        Table cells
        {columnSettings?.columns?.length ? ' (constituency layout)' : ''}
      </h4>
      <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {orderedCells.map((cell) => (
          <div key={cell.id} className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
              {cell.label}
            </dt>
            <dd
              className="mt-1 text-sm text-gray-900"
              dir={
                cell.id === 'cnic' || cell.id === 'age' || cell.id === 'silsila_no' ? 'ltr' : 'rtl'
              }
            >
              {cell.text || '—'}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
