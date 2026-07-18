'use client';

import { useCallback, useEffect, useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import type { AutomationConfig } from '@/lib/automation-config';

interface AutomationSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const emptyConfig: AutomationConfig = {
  enabled: true,
  autoProcessPages: true,
  autoGenerateParchiOnVerified: true,
  autoGenerateParchiOnRequest: true,
  maxPageWorkersPerTick: 40,
  maxParchiJobsPerTick: 10,
  maxParchiBatchesPerJobPerTick: 3,
  scope: 'global',
  halkaName: null,
};

export default function AutomationSettingsModal({ isOpen, onClose }: AutomationSettingsModalProps) {
  const [config, setConfig] = useState<AutomationConfig>(emptyConfig);
  const [halkaName, setHalkaName] = useState('');
  const [scope, setScope] = useState<'global' | 'halka'>('global');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (scope === 'halka' && halkaName.trim()) {
        params.set('halkaName', halkaName.trim());
      }
      const response = await fetch(`/api/automation/config?${params.toString()}`);
      const data = (await response.json()) as { config?: AutomationConfig; error?: string };
      if (!response.ok) throw new Error(data.error || 'Failed to load');
      if (data.config) setConfig(data.config);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load automation config');
    } finally {
      setLoading(false);
    }
  }, [scope, halkaName]);

  useEffect(() => {
    if (isOpen) void load();
  }, [isOpen, load]);

  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/automation/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope,
          halkaName: scope === 'halka' ? halkaName.trim() : undefined,
          config: {
            enabled: config.enabled,
            autoProcessPages: config.autoProcessPages,
            autoGenerateParchiOnVerified: config.autoGenerateParchiOnVerified,
            autoGenerateParchiOnRequest: config.autoGenerateParchiOnRequest,
            maxPageWorkersPerTick: config.maxPageWorkersPerTick,
            maxParchiJobsPerTick: config.maxParchiJobsPerTick,
            maxParchiBatchesPerJobPerTick: config.maxParchiBatchesPerJobPerTick,
          },
        }),
      });
      const data = (await response.json()) as { config?: AutomationConfig; error?: string };
      if (!response.ok) throw new Error(data.error || 'Failed to save');
      if (data.config) setConfig(data.config);
      toast.success('Automation settings saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const toggle = (key: keyof AutomationConfig) => {
    setConfig((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-500/75 p-4">
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-lg bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h3 className="text-lg font-medium text-gray-900">Automation settings</h3>
            <p className="mt-1 text-sm text-gray-500">
              Control AWS automator page processing and voter parchi generation. Manual console actions are
              unchanged.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-500" aria-label="Close">
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-auto px-6 py-4">
          <div className="flex gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={scope === 'global'}
                onChange={() => setScope('global')}
              />
              Global default
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={scope === 'halka'}
                onChange={() => setScope('halka')}
              />
              Per halka override
            </label>
          </div>

          {scope === 'halka' ? (
            <input
              value={halkaName}
              onChange={(e) => setHalkaName(e.target.value)}
              placeholder="Halka name (e.g. LA39)"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          ) : null}

          {loading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : (
            <>
              {(
                [
                  ['enabled', 'Automation enabled'],
                  ['autoProcessPages', 'Auto-process uploaded pages (OCR + enrichment)'],
                  ['autoGenerateParchiOnVerified', 'Auto-generate voter parchi for verified blocks'],
                  ['autoGenerateParchiOnRequest', 'Honor “Queue voter parchi” from work progress'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-start gap-3 text-sm text-gray-800">
                  <input
                    type="checkbox"
                    checked={Boolean(config[key])}
                    onChange={() => toggle(key)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600"
                  />
                  {label}
                </label>
              ))}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="text-xs text-gray-600">
                  Page workers / tick
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={config.maxPageWorkersPerTick}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        maxPageWorkersPerTick: Number(e.target.value) || 1,
                      }))
                    }
                    className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="text-xs text-gray-600">
                  Parchi jobs / tick
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={config.maxParchiJobsPerTick}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        maxParchiJobsPerTick: Number(e.target.value) || 1,
                      }))
                    }
                    className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="text-xs text-gray-600">
                  Batches / job / tick
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={config.maxParchiBatchesPerJobPerTick}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        maxParchiBatchesPerJobPerTick: Number(e.target.value) || 1,
                      }))
                    }
                    className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </label>
              </div>
            </>
          )}
        </div>

        <div className="flex gap-3 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || (scope === 'halka' && !halkaName.trim())}
            className="flex-1 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
