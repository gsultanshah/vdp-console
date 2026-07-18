'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowPathIcon, XMarkIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import type { AutomationLogEntry } from '@/lib/automation-logs';

interface AutomationLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AutomationLogsModal({ isOpen, onClose }: AutomationLogsModalProps) {
  const [items, setItems] = useState<AutomationLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [halkaName, setHalkaName] = useState('');
  const [level, setLevel] = useState('');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<AutomationLogEntry | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (halkaName.trim()) params.set('halkaName', halkaName.trim());
      if (level) params.set('level', level);
      if (q.trim()) params.set('q', q.trim());
      params.set('limit', '100');
      const response = await fetch(`/api/automation/logs?${params.toString()}`);
      const data = (await response.json()) as { items?: AutomationLogEntry[]; error?: string };
      if (!response.ok) throw new Error(data.error || 'Failed to load logs');
      setItems(data.items ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load logs');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [halkaName, level, q]);

  useEffect(() => {
    if (isOpen) void load();
  }, [isOpen, load]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-500/75 p-4">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col rounded-lg bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h3 className="text-lg font-medium text-gray-900">Automation log browser</h3>
            <p className="mt-1 text-sm text-gray-500">
              Orchestrator and worker actions from vdp-automator (MongoDB, ~30 day retention).
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-500" aria-label="Close">
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-3 border-b border-gray-100 px-6 py-3">
          <label className="text-xs text-gray-600">
            Halka
            <input
              value={halkaName}
              onChange={(e) => setHalkaName(e.target.value)}
              className="mt-1 block w-32 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              placeholder="LA39"
            />
          </label>
          <label className="text-xs text-gray-600">
            Level
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="mt-1 block rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="">All</option>
              <option value="info">info</option>
              <option value="warn">warn</option>
              <option value="error">error</option>
            </select>
          </label>
          <label className="min-w-[12rem] flex-1 text-xs text-gray-600">
            Search
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              placeholder="message, block, job, correlation…"
            />
          </label>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-5">
          <div className="overflow-auto lg:col-span-3">
            {loading && items.length === 0 ? (
              <p className="p-8 text-center text-sm text-gray-500">Loading…</p>
            ) : items.length === 0 ? (
              <p className="p-8 text-center text-sm text-gray-500">No logs found</p>
            ) : (
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="sticky top-0 bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Time</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Level</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Action</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Halka</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Message</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map((item) => (
                    <tr
                      key={item._id}
                      onClick={() => setSelected(item)}
                      className={`cursor-pointer hover:bg-indigo-50 ${
                        selected?._id === item._id ? 'bg-indigo-50' : ''
                      }`}
                    >
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-500">
                        {new Date(item.ts).toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                            item.level === 'error'
                              ? 'bg-rose-100 text-rose-800'
                              : item.level === 'warn'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {item.level}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-gray-700">
                        {item.action}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs">{item.halkaName || '—'}</td>
                      <td className="max-w-xs truncate px-3 py-2 text-xs text-gray-800">{item.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="overflow-auto border-t border-gray-200 bg-slate-50 p-4 lg:col-span-2 lg:border-l lg:border-t-0">
            {selected ? (
              <div className="space-y-2 text-sm">
                <p className="font-medium text-gray-900">{selected.action}</p>
                <p className="text-xs text-gray-500">{new Date(selected.ts).toLocaleString()}</p>
                <p>{selected.message}</p>
                <dl className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                  <div>
                    <dt className="font-semibold">Source</dt>
                    <dd>{selected.source}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold">Block</dt>
                    <dd>{selected.blockCode || '—'}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold">Job</dt>
                    <dd className="break-all">{selected.jobId || '—'}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold">Correlation</dt>
                    <dd className="break-all">{selected.correlationId || '—'}</dd>
                  </div>
                </dl>
                {selected.details ? (
                  <pre className="mt-3 max-h-80 overflow-auto rounded bg-white p-3 text-xs text-gray-700 ring-1 ring-gray-200">
                    {JSON.stringify(selected.details, null, 2)}
                  </pre>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-gray-500">Select a log row to inspect details.</p>
            )}
          </div>
        </div>

        <div className="border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
