'use client';

import { useState } from 'react';
import { ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import type { BlockCodeContext } from '@/lib/blockcode-hub';
import type { UploadImage } from '@/components/constituency/ImageViewerModal';
import { fetchJson } from '@/lib/fetch-json';

interface BlockCodeUploadTabProps {
  context: BlockCodeContext;
  onUploaded?: () => void;
}

interface BatchProgress {
  phase: 'idle' | 'uploading' | 'processing';
  current: number;
  total: number;
  currentFileName: string;
  uploadedCount: number;
  uploadErrors: number;
  created: number;
  enriched: number;
  unchanged: number;
  processErrors: number;
  ocrRun: number;
  lastError: string;
}

const IDLE: BatchProgress = {
  phase: 'idle',
  current: 0,
  total: 0,
  currentFileName: '',
  uploadedCount: 0,
  uploadErrors: 0,
  created: 0,
  enriched: 0,
  unchanged: 0,
  processErrors: 0,
  ocrRun: 0,
  lastError: '',
};

export default function BlockCodeUploadTab({ context, onUploaded }: BlockCodeUploadTabProps) {
  const { blockCode, halkaName } = context;
  const [files, setFiles] = useState<File[]>([]);
  const [tag, setTag] = useState('page');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [religion, setReligion] = useState<'muslim' | 'qadiani'>('muslim');
  const [recentPages, setRecentPages] = useState<UploadImage[]>([]);
  const [batch, setBatch] = useState<BatchProgress>(IDLE);
  const isBusy = batch.phase !== 'idle';

  const uploadFile = async (file: File): Promise<UploadImage> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('blockCode', blockCode);
    formData.append('halkaName', halkaName);
    formData.append('tag', tag);
    formData.append('gender', gender);
    formData.append('religion', religion);

    const response = await fetch('/api/blockcodes/upload-page/', { method: 'POST', body: formData });
    const data: { upload?: UploadImage; error?: string } = await response.json();
    if (!response.ok || !data.upload) {
      throw new Error(data.error || 'Upload failed');
    }
    return data.upload;
  };

  const uploadAll = async (): Promise<UploadImage[]> => {
    if (!files.length) {
      toast.error('Select page images first');
      return [];
    }

    const uploaded: UploadImage[] = [];
    let uploadErrors = 0;
    let lastError = '';

    setBatch({ ...IDLE, phase: 'uploading', total: files.length, currentFileName: files[0].name });

    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      setBatch((prev) => ({ ...prev, current: i, currentFileName: file.name, uploadedCount: uploaded.length, uploadErrors, lastError: '' }));
      try {
        uploaded.push(await uploadFile(file));
      } catch (error) {
        uploadErrors += 1;
        lastError = error instanceof Error ? error.message : 'Upload failed';
      }
      setBatch((prev) => ({ ...prev, current: i + 1, uploadedCount: uploaded.length, uploadErrors, lastError }));
    }

    setRecentPages(uploaded);
    setFiles([]);
    setBatch((prev) => ({ ...prev, phase: 'idle', currentFileName: '' }));

    if (uploaded.length) {
      onUploaded?.();
      toast.success(`Uploaded ${uploaded.length} page${uploaded.length === 1 ? '' : 's'}`);
    } else {
      toast.error('All uploads failed');
    }
    return uploaded;
  };

  const processPages = async (pages: UploadImage[]) => {
    if (!pages.length) {
      toast.error('Upload pages first');
      return;
    }

    let created = 0;
    let enriched = 0;
    let unchanged = 0;
    let processErrors = 0;
    let ocrRun = 0;
    let lastError = '';

    setBatch({ ...IDLE, phase: 'processing', total: pages.length, currentFileName: pages[0].fileName });

    for (let i = 0; i < pages.length; i += 1) {
      const page = pages[i];
      setBatch((prev) => ({ ...prev, current: i, currentFileName: page.fileName, created, enriched, unchanged, processErrors, ocrRun, lastError: '' }));

      try {
        const { response, data } = await fetchJson<{
          details?: string;
          error?: string;
          enrich?: { created?: number; enriched?: number; unchanged?: number; errors?: number };
          ocr_skipped?: boolean;
        }>(`/api/blockcodes/process-enrich/?page_id=${encodeURIComponent(page._id)}`);

        if (!response.ok) throw new Error(data.details || data.error || 'Processing failed');
        created += data.enrich?.created ?? 0;
        enriched += data.enrich?.enriched ?? 0;
        unchanged += data.enrich?.unchanged ?? 0;
        processErrors += data.enrich?.errors ?? 0;
        if (!data.ocr_skipped) ocrRun += 1;
      } catch (error) {
        processErrors += 1;
        lastError = error instanceof Error ? error.message : 'Processing failed';
      }

      setBatch({ phase: 'processing', current: i + 1, total: pages.length, currentFileName: page.fileName, uploadedCount: pages.length, uploadErrors: 0, created, enriched, unchanged, processErrors, ocrRun, lastError });
    }

    setBatch((prev) => ({ ...prev, phase: 'idle', currentFileName: '' }));
    onUploaded?.();
    toast.success(`Processed ${pages.length} page(s) — ${created} created, ${enriched} enriched`);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Quick upload</h2>
        <p className="text-sm text-gray-500">
          Upload page images to block {blockCode} in {halkaName}.
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
          <ArrowUpTrayIcon className="h-5 w-5 text-blue-600" />
          Upload pages
        </div>

        <div className="mt-4 space-y-4">
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={isBusy}
            onChange={(event) => {
              setFiles(Array.from(event.target.files ?? []));
              setRecentPages([]);
              setBatch(IDLE);
            }}
            className="block w-full text-sm text-gray-700 file:mr-4 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100 disabled:opacity-50"
          />

          {files.length > 0 && (
            <p className="text-sm text-gray-600">{files.length} file{files.length === 1 ? '' : 's'} selected</p>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <select value={tag} onChange={(e) => setTag(e.target.value)} disabled={isBusy} className="rounded-md border border-gray-300 py-2 pl-3 pr-8 text-sm">
              <option value="page">Page</option>
              <option value="title">Title</option>
            </select>
            <select value={gender} onChange={(e) => setGender(e.target.value === 'female' ? 'female' : 'male')} disabled={isBusy} className="rounded-md border border-gray-300 py-2 pl-3 pr-8 text-sm">
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
            <select value={religion} onChange={(e) => setReligion(e.target.value === 'qadiani' ? 'qadiani' : 'muslim')} disabled={isBusy} className="rounded-md border border-gray-300 py-2 pl-3 pr-8 text-sm">
              <option value="muslim">Muslim</option>
              <option value="qadiani">Qadiani</option>
            </select>
          </div>

          {batch.phase !== 'idle' && (
            <div>
              <div className="h-2.5 w-full rounded-full bg-gray-200">
                <div
                  className="h-2.5 rounded-full bg-green-600 transition-all"
                  style={{ width: `${batch.total > 0 ? (batch.current / batch.total) * 100 : 0}%` }}
                />
              </div>
              <p className="mt-2 text-center text-sm text-gray-600">
                {batch.phase === 'uploading' ? 'Uploading' : 'Processing'} {batch.current} of {batch.total}
              </p>
              {batch.currentFileName && (
                <p className="mt-1 truncate text-center text-xs text-gray-500">{batch.currentFileName}</p>
              )}
              {batch.lastError && <p className="mt-1 text-center text-xs text-red-600">{batch.lastError}</p>}
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={() => void uploadAll()}
              disabled={isBusy || !files.length}
              className="flex-1 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {batch.phase === 'uploading' ? 'Uploading…' : `Upload ${files.length || ''} page(s)`.trim()}
            </button>
            <button
              onClick={() => void processPages(recentPages)}
              disabled={!recentPages.length || isBusy}
              className="flex-1 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              Process uploaded
            </button>
            <button
              onClick={async () => {
                const uploaded = await uploadAll();
                if (uploaded.length) await processPages(uploaded);
              }}
              disabled={isBusy || !files.length}
              className="flex-1 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              Upload & Process
            </button>
          </div>

          {recentPages.length > 0 && batch.phase === 'idle' && (
            <p className="text-sm text-green-700">{recentPages.length} page(s) ready to process</p>
          )}
        </div>
      </div>
    </div>
  );
}
