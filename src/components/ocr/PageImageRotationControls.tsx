'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import {
  ArrowPathIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
} from '@heroicons/react/24/outline';

interface PageImageRotationControlsProps {
  pageId: string;
  previewRotation: number;
  onPreviewRotationChange: (degrees: number) => void;
  onSaved: (result: { url: string; ocrCleared: boolean }) => void;
  disabled?: boolean;
  compact?: boolean;
}

function normalizePreviewDegrees(degrees: number): number {
  const normalized = degrees % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

export default function PageImageRotationControls({
  pageId,
  previewRotation,
  onPreviewRotationChange,
  onSaved,
  disabled = false,
  compact = false,
}: PageImageRotationControlsProps) {
  const [customDegrees, setCustomDegrees] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const addRotation = (delta: number) => {
    onPreviewRotationChange(normalizePreviewDegrees(previewRotation + delta));
  };

  const applyCustomRotation = () => {
    const parsed = Number(customDegrees.trim());
    if (!Number.isFinite(parsed) || parsed === 0) {
      toast.error('Enter a non-zero rotation angle in degrees');
      return;
    }
    onPreviewRotationChange(normalizePreviewDegrees(previewRotation + parsed));
    setCustomDegrees('');
  };

  const saveRotation = async () => {
    if (previewRotation === 0) {
      toast.error('Adjust rotation before saving');
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`/api/blockcodes/${pageId}/rotate/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ degrees: previewRotation }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.details || data.error || 'Failed to save rotation');
      }

      toast.success('Page image updated');
      onPreviewRotationChange(0);
      onSaved({ url: data.url as string, ocrCleared: Boolean(data.ocrCleared) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save rotation');
    } finally {
      setIsSaving(false);
    }
  };

  const resetPreview = () => {
    onPreviewRotationChange(0);
    setCustomDegrees('');
  };

  const iconButtonClass =
    'inline-flex items-center justify-center rounded-md border border-gray-300 bg-white p-2 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div
      className={`flex flex-wrap items-center gap-2 ${compact ? '' : 'rounded-lg border border-gray-200 bg-gray-50 px-3 py-2'}`}
    >
      {!compact && <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Rotate</span>}

      <button
        type="button"
        title="Rotate 90° counter-clockwise"
        disabled={disabled || isSaving}
        onClick={() => addRotation(-90)}
        className={iconButtonClass}
      >
        <ArrowUturnLeftIcon className="h-4 w-4" />
        <span className="sr-only">Rotate 90° left</span>
      </button>

      <button
        type="button"
        title="Rotate 90° clockwise"
        disabled={disabled || isSaving}
        onClick={() => addRotation(90)}
        className={iconButtonClass}
      >
        <ArrowUturnRightIcon className="h-4 w-4" />
        <span className="sr-only">Rotate 90° right</span>
      </button>

      <button
        type="button"
        title="Rotate 180°"
        disabled={disabled || isSaving}
        onClick={() => addRotation(180)}
        className={iconButtonClass}
      >
        <ArrowPathIcon className="h-4 w-4" />
        <span className="sr-only">Rotate 180°</span>
      </button>

      <div className="flex items-center gap-1.5">
        <input
          type="number"
          value={customDegrees}
          onChange={(e) => setCustomDegrees(e.target.value)}
          placeholder="Custom °"
          disabled={disabled || isSaving}
          className="w-20 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              applyCustomRotation();
            }
          }}
        />
        <button
          type="button"
          disabled={disabled || isSaving || !customDegrees.trim()}
          onClick={applyCustomRotation}
          className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Apply
        </button>
      </div>

      {previewRotation !== 0 && (
        <span className="text-xs font-medium text-indigo-700">{previewRotation}° preview</span>
      )}

      <button
        type="button"
        disabled={disabled || isSaving || previewRotation === 0}
        onClick={() => void saveRotation()}
        className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSaving ? 'Saving…' : 'Save image'}
      </button>

      {previewRotation !== 0 && (
        <button
          type="button"
          disabled={disabled || isSaving}
          onClick={resetPreview}
          className="rounded-md px-2 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 disabled:opacity-50"
        >
          Reset
        </button>
      )}
    </div>
  );
}
