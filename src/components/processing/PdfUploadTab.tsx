'use client';

import { useEffect, useState } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, onValue, ref } from 'firebase/database';
import toast from 'react-hot-toast';
import { firebaseConfig, isFirebaseClientConfigured } from '@/config/firebase';
import { Progress } from '@/components/ui/progress';
import type { PdfUploadJob } from '@/lib/pipeline-types';
import { blockCodeFromPdfFileName } from '@/lib/pdf-utils';

interface ConstituencyOption {
  _id: string;
  halkaName: string;
}

const STEP_LABELS: Record<PdfUploadJob['status'], string> = {
  received: 'Received PDF',
  extracting: 'Extracting pages',
  uploading: 'Uploading pages',
  completed: 'Completed',
  failed: 'Failed',
};

function halkaKey(halkaName: string): string {
  return halkaName.replace(/\s+/g, '').toUpperCase().replace(/[.#$/[\]]/g, '_');
}

export default function PdfUploadTab() {
  const [constituencies, setConstituencies] = useState<ConstituencyOption[]>([]);
  const [halkaName, setHalkaName] = useState('');
  const [blockCode, setBlockCode] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [activeJob, setActiveJob] = useState<PdfUploadJob | null>(null);
  const [recentJobs, setRecentJobs] = useState<PdfUploadJob[]>([]);

  useEffect(() => {
    fetch('/api/constituency?activeOnly=true')
      .then((response) => response.json())
      .then((data: ConstituencyOption[]) => {
        setConstituencies(data);
        if (data.length && !halkaName) {
          setHalkaName(data[0].halkaName);
        }
      })
      .catch(() => undefined);
  }, [halkaName]);

  useEffect(() => {
    if (!halkaName) {
      return;
    }

    const poll = async () => {
      const response = await fetch(`/api/pdf-upload?halkaName=${encodeURIComponent(halkaName)}`);
      if (!response.ok) {
        return;
      }
      const data = await response.json();
      setRecentJobs(data.jobs ?? []);
    };

    void poll();
    const interval = setInterval(() => void poll(), 3000);
    return () => clearInterval(interval);
  }, [halkaName]);

  useEffect(() => {
    if (!activeJob || !halkaName || !isFirebaseClientConfigured()) {
      return;
    }

    const app = getApps().length
      ? getApps()[0]
      : initializeApp({
          apiKey: firebaseConfig.apiKey,
          authDomain: firebaseConfig.authDomain,
          projectId: firebaseConfig.projectId,
          databaseURL: firebaseConfig.databaseURL,
          appId: firebaseConfig.appId,
        });

    const db = getDatabase(app);
    const jobRef = ref(db, `pipeline/${halkaKey(halkaName)}/jobs/${activeJob.jobId}`);
    const unsubscribe = onValue(jobRef, (snapshot) => {
      if (snapshot.exists()) {
        setActiveJob({ ...(snapshot.val() as PdfUploadJob), jobId: activeJob.jobId });
      }
    });

    return () => unsubscribe();
  }, [activeJob?.jobId, halkaName]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (!selected) {
      return;
    }
    if (!selected.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Please select a PDF file');
      return;
    }
    setFile(selected);
    if (!blockCode) {
      setBlockCode(blockCodeFromPdfFileName(selected.name));
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error('Select a PDF file first');
      return;
    }
    if (!halkaName) {
      toast.error('Select a constituency');
      return;
    }

    setIsUploading(true);
    setActiveJob(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('halkaName', halkaName);
      if (blockCode.trim()) {
        formData.append('blockCode', blockCode.trim());
      }

      const response = await fetch('/api/pdf-upload', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      setActiveJob(data.job);
      toast.success(data.message || 'PDF processed');
      setFile(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const jobProgress = activeJob
    ? activeJob.totalPages > 0
      ? Math.round(((activeJob.uploadedPages + activeJob.failedPages) / activeJob.totalPages) * 100)
      : activeJob.status === 'completed'
        ? 100
        : 0
    : 0;

  const pageRows = activeJob?.pages
    ? Object.values(activeJob.pages).sort((a, b) => a.pageNumber - b.pageNumber)
    : [];

  return (
    <div className="space-y-6">
      <div className="bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6 space-y-4">
          <div>
            <h3 className="text-lg font-medium text-gray-900">Upload PDF</h3>
            <p className="mt-1 text-sm text-gray-500">
              Upload a block-code PDF. Each page is extracted as a JPEG, uploaded to Firebase Storage,
              and registered in MongoDB. Progress is tracked live in the pipeline.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="pdf-halka" className="block text-sm font-medium text-gray-700">
                Constituency
              </label>
              <select
                id="pdf-halka"
                value={halkaName}
                onChange={(e) => setHalkaName(e.target.value)}
                className="mt-1 block w-full rounded-lg border-0 py-2.5 px-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
              >
                {constituencies.map((constituency) => (
                  <option key={constituency._id} value={constituency.halkaName}>
                    {constituency.halkaName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="pdf-blockcode" className="block text-sm font-medium text-gray-700">
                Block code
              </label>
              <input
                id="pdf-blockcode"
                type="text"
                value={blockCode}
                onChange={(e) => setBlockCode(e.target.value)}
                placeholder="Auto-detected from PDF filename"
                className="mt-1 block w-full rounded-lg border-0 py-2.5 px-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
              />
            </div>
          </div>

          <div>
            <label htmlFor="pdf-file" className="block text-sm font-medium text-gray-700">
              PDF file
            </label>
            <input
              id="pdf-file"
              type="file"
              accept=".pdf,application/pdf"
              onChange={handleFileChange}
              className="mt-1 block w-full text-sm text-gray-700"
            />
            {file && (
              <p className="mt-1 text-xs text-gray-500">
                {file.name} · {(file.size / (1024 * 1024)).toFixed(2)} MB
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => void handleUpload()}
            disabled={isUploading || !file}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {isUploading ? 'Processing PDF...' : 'Upload & extract pages'}
          </button>
        </div>
      </div>

      {activeJob && (
        <div className="bg-white shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-semibold text-gray-900">
                  {activeJob.sourceFileName} · {activeJob.blockCode}
                </h4>
                <p className="text-xs text-gray-500 mt-1">
                  Step: {STEP_LABELS[activeJob.status]} · {activeJob.uploadedPages}/{activeJob.totalPages} uploaded
                  {activeJob.failedPages > 0 ? ` · ${activeJob.failedPages} failed` : ''}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  activeJob.status === 'completed'
                    ? 'bg-green-100 text-green-800'
                    : activeJob.status === 'failed'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-blue-100 text-blue-800'
                }`}
              >
                {STEP_LABELS[activeJob.status]}
              </span>
            </div>

            <Progress value={jobProgress} className="h-2" />

            {activeJob.error && (
              <p className="text-sm text-red-600">{activeJob.error}</p>
            )}

            {pageRows.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-gray-500">
                      <th className="py-2 pr-4">Page</th>
                      <th className="py-2 pr-4">File</th>
                      <th className="py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pageRows.map((page) => (
                      <tr key={page.pageNumber}>
                        <td className="py-2 pr-4">{page.pageNumber}</td>
                        <td className="py-2 pr-4 font-mono text-xs">{page.fileName ?? '—'}</td>
                        <td className="py-2 capitalize">{page.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {recentJobs.length > 0 && (
        <div className="bg-white shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h4 className="text-sm font-semibold text-gray-900">Recent PDF jobs</h4>
            <div className="mt-4 divide-y divide-gray-200">
              {recentJobs.slice(0, 10).map((job) => (
                <button
                  key={job.jobId}
                  type="button"
                  onClick={() => setActiveJob(job)}
                  className="w-full py-3 text-left hover:bg-gray-50"
                >
                  <p className="text-sm font-medium text-gray-900">
                    {job.sourceFileName} · {job.blockCode}
                  </p>
                  <p className="text-xs text-gray-500">
                    {STEP_LABELS[job.status]} · {job.uploadedPages}/{job.totalPages} pages ·{' '}
                    {new Date(job.startedAt).toLocaleString()}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
