'use client';

import { useEffect, useState } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, onValue, ref, type Database } from 'firebase/database';
import { firebaseConfig, isFirebaseClientConfigured } from '@/config/firebase';
import { Progress } from '@/components/ui/progress';
import type { PdfUploadJob, PipelineMeta, PipelineStageKey, UploadSession } from '@/lib/pipeline-types';
import { createEmptyPipelineMeta } from '@/lib/pipeline-types';

interface ConstituencyOption {
  _id: string;
  halkaName: string;
}

const STAGE_LABELS: Record<PipelineStageKey, string> = {
  pdfExtract: 'PDF extract',
  upload: 'Upload',
  titleTagging: 'Title tagging',
  ocr: 'OCR',
  processing: 'Processing',
  enrichment: 'Enrichment',
  integrity: 'Integrity checks',
};

function stagePercent(counts: { completed: number; total: number; failed: number }): number {
  if (counts.total <= 0) {
    return counts.completed > 0 ? 100 : 0;
  }
  return Math.min(100, Math.round((counts.completed / counts.total) * 100));
}

function getClientDatabase(): Database | null {
  if (!isFirebaseClientConfigured()) {
    return null;
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

  return getDatabase(app);
}

export default function LivePipelinePanel() {
  const [constituencies, setConstituencies] = useState<ConstituencyOption[]>([]);
  const [selectedHalka, setSelectedHalka] = useState('');
  const [meta, setMeta] = useState<PipelineMeta>(createEmptyPipelineMeta());
  const [sessions, setSessions] = useState<UploadSession[]>([]);
  const [jobs, setJobs] = useState<PdfUploadJob[]>([]);
  const [configured, setConfigured] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/constituency?activeOnly=true')
      .then((response) => response.json())
      .then((data) => {
        const items = data as ConstituencyOption[];
        setConstituencies(items);
        if (items.length && !selectedHalka) {
          setSelectedHalka(items[0].halkaName);
        }
      })
      .catch(() => undefined);
  }, [selectedHalka]);

  useEffect(() => {
    if (!selectedHalka) {
      return;
    }

    const db = getClientDatabase();
    if (db) {
      const halkaKey = selectedHalka.replace(/\s+/g, '').toUpperCase().replace(/[.#$/[\]]/g, '_');
      const metaRef = ref(db, `pipeline/${halkaKey}/meta`);
      const sessionsRef = ref(db, `pipeline/${halkaKey}/sessions`);
      const jobsRef = ref(db, `pipeline/${halkaKey}/jobs`);

      const unsubMeta = onValue(metaRef, (snapshot) => {
        setConfigured(true);
        setMeta(snapshot.exists() ? { ...createEmptyPipelineMeta(), ...(snapshot.val() as PipelineMeta) } : createEmptyPipelineMeta());
        setLastUpdated(Date.now());
      });

      const unsubSessions = onValue(sessionsRef, (snapshot) => {
        if (!snapshot.exists()) {
          setSessions([]);
          return;
        }
        const value = snapshot.val() as Record<string, UploadSession>;
        setSessions(
          Object.entries(value).map(([sessionId, session]) => ({
            ...session,
            sessionId,
          }))
        );
      });

      const unsubJobs = onValue(jobsRef, (snapshot) => {
        if (!snapshot.exists()) {
          setJobs([]);
          return;
        }
        const value = snapshot.val() as Record<string, PdfUploadJob>;
        setJobs(
          Object.entries(value)
            .map(([jobId, job]) => ({ ...job, jobId }))
            .sort((a, b) => b.startedAt - a.startedAt)
        );
      });

      return () => {
        unsubMeta();
        unsubSessions();
        unsubJobs();
      };
    }

    const poll = async () => {
      const response = await fetch(`/api/pipeline?halkaName=${encodeURIComponent(selectedHalka)}`);
      const data = await response.json();
      if (response.status === 503) {
        setConfigured(false);
        return;
      }
      if (response.ok) {
        setConfigured(true);
        setMeta(data.meta ?? createEmptyPipelineMeta());
        setSessions(data.sessions ?? []);
        setJobs(data.jobs ?? []);
        setLastUpdated(Date.now());
      }
    };

    void poll();
    const interval = setInterval(() => void poll(), 3000);
    return () => clearInterval(interval);
  }, [selectedHalka]);

  const syncFromMongo = async () => {
    if (!selectedHalka) {
      return;
    }
    setIsSyncing(true);
    try {
      const response = await fetch(
        `/api/pipeline?halkaName=${encodeURIComponent(selectedHalka)}`,
        { method: 'POST' }
      );
      const data = await response.json();
      if (response.ok) {
        setMeta(data.meta ?? createEmptyPipelineMeta());
        setSessions(data.sessions ?? []);
        setJobs(data.jobs ?? []);
        setLastUpdated(Date.now());
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const activeSessions = sessions.filter((session) => session.status === 'running');

  return (
    <div className="space-y-6">
      <div className="bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-medium text-gray-900">Live pipeline</h3>
              <p className="mt-1 text-sm text-gray-500">
                Real-time upload, processing, enrichment, and integrity progress from Firebase.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void syncFromMongo()}
              disabled={!selectedHalka || isSyncing}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {isSyncing ? 'Syncing...' : 'Sync from MongoDB'}
            </button>
          </div>

          {!configured && (
            <div className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Firebase Realtime Database is not configured. Add FIREBASE_DATABASE_URL and service account
              credentials to .env.
            </div>
          )}

          <div>
            <label htmlFor="pipeline-halka" className="block text-sm font-medium text-gray-700">
              Constituency
            </label>
            <select
              id="pipeline-halka"
              value={selectedHalka}
              onChange={(e) => setSelectedHalka(e.target.value)}
              className="mt-1 block w-full max-w-md rounded-lg border-0 py-2.5 px-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
            >
              {constituencies.map((constituency) => (
                <option key={constituency._id} value={constituency.halkaName}>
                  {constituency.halkaName}
                </option>
              ))}
            </select>
          </div>

          {lastUpdated && (
            <p className="text-xs text-gray-500">
              Last update: {new Date(lastUpdated).toLocaleTimeString()} · Active upload sessions:{' '}
              {meta.activeUploadSessions} · Block codes: {meta.blockCodesTotal}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {(Object.keys(STAGE_LABELS) as PipelineStageKey[]).map((stage) => {
          const counts = meta.stages[stage];
          const total = Math.max(counts.total, counts.completed + counts.pending + counts.failed);
          const pct = stagePercent({ completed: counts.completed, total, failed: counts.failed });

          return (
            <div key={stage} className="rounded-lg bg-white p-5 shadow ring-1 ring-gray-200">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-semibold text-gray-900">{STAGE_LABELS[stage]}</h4>
                <span className="text-sm text-gray-600">{pct}%</span>
              </div>
              <Progress value={pct} className="mt-3 h-2" />
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-600 sm:grid-cols-4">
                <div>
                  <dt>Done</dt>
                  <dd className="font-medium text-gray-900">{counts.completed}</dd>
                </div>
                <div>
                  <dt>Pending</dt>
                  <dd className="font-medium text-gray-900">{counts.pending}</dd>
                </div>
                <div>
                  <dt>In flight</dt>
                  <dd className="font-medium text-gray-900">{counts.inFlight}</dd>
                </div>
                <div>
                  <dt>Failed</dt>
                  <dd className="font-medium text-red-700">{counts.failed}</dd>
                </div>
              </dl>
            </div>
          );
        })}
      </div>

      <div className="bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h4 className="text-sm font-semibold text-gray-900">
            Active uploaders ({activeSessions.length})
          </h4>
          {activeSessions.length === 0 ? (
            <p className="mt-3 text-sm text-gray-500">No active upload sessions.</p>
          ) : (
            <div className="mt-4 divide-y divide-gray-200">
              {activeSessions.map((session) => (
                <div key={session.sessionId} className="py-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <p className="text-xs uppercase text-gray-500">Session</p>
                    <p className="font-mono text-gray-900 truncate">{session.sessionId}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-gray-500">Operator</p>
                    <p className="text-gray-900">{session.operatorId}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-gray-500">Block</p>
                    <p className="text-gray-900">{session.currentBlockCode ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-gray-500">Files</p>
                    <p className="text-gray-900">
                      {session.filesUploaded} ok · {session.filesFailed} failed · {session.filesInFlight} active
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h4 className="text-sm font-semibold text-gray-900">
            PDF upload jobs ({jobs.length})
          </h4>
          {jobs.length === 0 ? (
            <p className="mt-3 text-sm text-gray-500">No PDF upload jobs yet.</p>
          ) : (
            <div className="mt-4 divide-y divide-gray-200">
              {jobs.slice(0, 8).map((job) => (
                <div key={job.jobId} className="py-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <p className="text-xs uppercase text-gray-500">PDF</p>
                    <p className="text-gray-900 truncate">{job.sourceFileName}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-gray-500">Block</p>
                    <p className="text-gray-900">{job.blockCode}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-gray-500">Step</p>
                    <p className="text-gray-900 capitalize">{job.status}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-gray-500">Pages</p>
                    <p className="text-gray-900">
                      {job.uploadedPages}/{job.totalPages} uploaded
                      {job.failedPages > 0 ? ` · ${job.failedPages} failed` : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
