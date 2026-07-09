'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';

type PollingSchemeReport = {
  halkaName: string;
  total: number;
  distinctBlockcodes: number;
  byType: Record<string, number>;
  bySource: Record<string, number>;
  byRowType: Record<string, number>;
  latestImport: {
    importedAt: string | null;
    source: string | null;
    sourceFileName: string | null;
    sourceFileUrl?: string | null;
  } | null;
};

type ImportRecord = {
  id: string;
  sourceFileName: string | null;
  sourceFileUrl: string | null;
  importedAt: string | null;
  insertedRows: number;
  skippedRows: number;
  status: string;
};

type SchemeRow = {
  id: string;
  page: number | null;
  district: string;
  sn: string;
  pollingStation: string;
  areaType: string;
  areaName: string;
  blockcode: string | number;
  male: number;
  female: number;
  total: number;
  maleBooth: string;
  femaleBooth: string;
  totalBooth: string;
  rowType: string;
  type: string;
  sourceRawText: string;
};

type RowFormState = {
  page: string;
  district: string;
  sn: string;
  pollingStation: string;
  areaType: string;
  areaName: string;
  blockcode: string;
  male: string;
  female: string;
  total: string;
  maleBooth: string;
  femaleBooth: string;
  totalBooth: string;
  rowType: string;
  type: string;
  sourceRawText: string;
};

const EMPTY_FORM: RowFormState = {
  page: '',
  district: '',
  sn: '',
  pollingStation: '',
  areaType: 'Ward/Mohalla/Street',
  areaName: '',
  blockcode: '',
  male: '0',
  female: '0',
  total: '0',
  maleBooth: '',
  femaleBooth: '',
  totalBooth: '',
  rowType: 'Detail',
  type: 'combined',
  sourceRawText: '',
};

function rowToForm(row?: SchemeRow | null): RowFormState {
  if (!row) return { ...EMPTY_FORM };
  return {
    page: row.page == null ? '' : String(row.page),
    district: row.district,
    sn: row.sn,
    pollingStation: row.pollingStation,
    areaType: row.areaType,
    areaName: row.areaName,
    blockcode: String(row.blockcode ?? ''),
    male: String(row.male),
    female: String(row.female),
    total: String(row.total),
    maleBooth: row.maleBooth,
    femaleBooth: row.femaleBooth,
    totalBooth: row.totalBooth,
    rowType: row.rowType || 'Detail',
    type: row.type || 'combined',
    sourceRawText: row.sourceRawText,
  };
}

function formToPayload(form: RowFormState) {
  const male = Number.parseInt(form.male, 10) || 0;
  const female = Number.parseInt(form.female, 10) || 0;
  const total = Number.parseInt(form.total, 10) || male + female;
  return {
    page: form.page ? Number.parseInt(form.page, 10) : null,
    district: form.district,
    sn: form.sn,
    pollingStation: form.pollingStation,
    areaType: form.areaType,
    areaName: form.areaName,
    blockcode: form.blockcode,
    male,
    female,
    total,
    maleBooth: form.maleBooth,
    femaleBooth: form.femaleBooth,
    totalBooth: form.totalBooth,
    rowType: form.rowType,
    type: form.type,
    sourceRawText: form.sourceRawText,
  };
}

export default function PollingSchemePanel({ halkaName }: { halkaName: string }) {
  const normalizedHalka = useMemo(() => halkaName.replace(/\s+/g, '').toUpperCase(), [halkaName]);
  const [district, setDistrict] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [report, setReport] = useState<PollingSchemeReport | null>(null);
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [rows, setRows] = useState<SchemeRow[]>([]);
  const [rowSearch, setRowSearch] = useState('');
  const [rowTypeFilter, setRowTypeFilter] = useState('');
  const [stationTypeFilter, setStationTypeFilter] = useState('');
  const [rowPage, setRowPage] = useState(1);
  const [rowTotal, setRowTotal] = useState(0);
  const [rowLimit] = useState(20);
  const [reportLoading, setReportLoading] = useState(false);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<SchemeRow | null>(null);
  const [form, setForm] = useState<RowFormState>(EMPTY_FORM);
  const [savingRow, setSavingRow] = useState(false);

  const loadReport = useCallback(async () => {
    setReportLoading(true);
    try {
      const params = new URLSearchParams({ halkaName: normalizedHalka });
      const [reportRes, importsRes] = await Promise.all([
        fetch(`/api/polling-scheme/report?${params.toString()}`),
        fetch(`/api/polling-scheme/imports?${params.toString()}`),
      ]);
      const reportData = (await reportRes.json()) as PollingSchemeReport | { error?: string };
      const importsData = (await importsRes.json()) as { imports?: ImportRecord[] };
      if (!reportRes.ok) throw new Error('error' in reportData ? reportData.error : 'Failed to load report');
      setReport(reportData as PollingSchemeReport);
      setImports(importsData.imports ?? []);
    } catch (error) {
      console.error(error);
      setReport(null);
      setImports([]);
    } finally {
      setReportLoading(false);
    }
  }, [normalizedHalka]);

  const loadRows = useCallback(async () => {
    setRowsLoading(true);
    try {
      const params = new URLSearchParams({
        halkaName: normalizedHalka,
        page: String(rowPage),
        limit: String(rowLimit),
      });
      if (rowSearch.trim()) params.set('search', rowSearch.trim());
      if (rowTypeFilter) params.set('rowType', rowTypeFilter);
      if (stationTypeFilter) params.set('type', stationTypeFilter);

      const res = await fetch(`/api/polling-scheme/rows?${params.toString()}`);
      const data = (await res.json()) as { rows?: SchemeRow[]; total?: number; error?: string };
      if (!res.ok) throw new Error(data.error || 'Failed to load rows');
      setRows(data.rows ?? []);
      setRowTotal(data.total ?? 0);
    } catch (error) {
      console.error(error);
      setRows([]);
      setRowTotal(0);
    } finally {
      setRowsLoading(false);
    }
  }, [normalizedHalka, rowPage, rowLimit, rowSearch, rowTypeFilter, stationTypeFilter]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const totalPages = Math.max(1, Math.ceil(rowTotal / rowLimit));

  const handleUpload = async () => {
    if (!file) return toast.error('Select a file first.');
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('halkaName', normalizedHalka);
      formData.append('replaceExisting', String(replaceExisting));
      if (district.trim()) formData.append('district', district.trim());

      const res = await fetch('/api/polling-scheme/upload', { method: 'POST', body: formData });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      toast.success(data.message || 'Imported');
      setFile(null);
      setRowPage(1);
      await Promise.all([loadReport(), loadRows()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteAll = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch('/api/polling-scheme/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'halkaName', value: normalizedHalka }),
      });
      const data = (await res.json()) as { deletedCount?: number; error?: string };
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      toast.success(`Deleted ${data.deletedCount ?? 0} rows`);
      setRowPage(1);
      await Promise.all([loadReport(), loadRows()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Delete failed');
    } finally {
      setIsDeleting(false);
    }
  };

  const openCreateModal = () => {
    setEditingRow(null);
    setForm({ ...EMPTY_FORM, district });
    setModalOpen(true);
  };

  const openEditModal = (row: SchemeRow) => {
    setEditingRow(row);
    setForm(rowToForm(row));
    setModalOpen(true);
  };

  const handleSaveRow = async () => {
    setSavingRow(true);
    try {
      const payload = formToPayload(form);
      const url = editingRow
        ? `/api/polling-scheme/rows/${editingRow.id}`
        : '/api/polling-scheme/rows';
      const res = await fetch(url, {
        method: editingRow ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, halkaName: normalizedHalka }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || 'Save failed');
      toast.success(editingRow ? 'Row updated' : 'Row created');
      setModalOpen(false);
      await Promise.all([loadReport(), loadRows()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Save failed');
    } finally {
      setSavingRow(false);
    }
  };

  const handleDeleteRow = async (rowId: string) => {
    try {
      const res = await fetch(`/api/polling-scheme/rows/${rowId}`, { method: 'DELETE' });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      toast.success('Row deleted');
      await Promise.all([loadReport(), loadRows()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Delete failed');
    }
  };

  const printPdfUrl = `/api/polling-scheme/print?${new URLSearchParams({
    halkaName: normalizedHalka,
    format: 'pdf',
    ...(rowSearch.trim() ? { search: rowSearch.trim() } : {}),
  }).toString()}`;

  const printHtmlUrl = `/api/polling-scheme/print?${new URLSearchParams({
    halkaName: normalizedHalka,
    format: 'html',
    ...(rowSearch.trim() ? { search: rowSearch.trim() } : {}),
  }).toString()}`;

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Polling scheme</h2>
          <p className="mt-1 text-sm text-slate-500">
            Upload, search, edit, and print polling scheme data for{' '}
            <span className="font-mono font-semibold">{normalizedHalka}</span>.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href="/api/polling-scheme/sample" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
            Sample Excel
          </a>
          <a href={`/api/polling-scheme/export?halkaName=${normalizedHalka}`} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
            Excel
          </a>
          <a href={printPdfUrl} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
            PDF
          </a>
          <a href={printHtmlUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
            Print view
          </a>
          <button type="button" onClick={() => void loadReport()} disabled={reportLoading} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
            {reportLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total rows</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{reportLoading ? '…' : report?.total.toLocaleString() ?? '—'}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Blockcodes</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{reportLoading ? '…' : report?.distinctBlockcodes.toLocaleString() ?? '—'}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Latest import</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {report?.latestImport?.importedAt ? new Date(report.latestImport.importedAt).toLocaleString() : '—'}
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-4 rounded-xl border border-slate-200 p-4">
        <h3 className="text-sm font-bold text-slate-900">Import file</h3>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <input value={district} onChange={(e) => setDistrict(e.target.value)} placeholder="District / ضلع" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          <input type="file" accept=".xlsx,.xls,.csv,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} disabled={isUploading} className="text-sm" />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={replaceExisting} onChange={(e) => setReplaceExisting(e.target.checked)} />
          Replace existing rows before import
        </label>
        <button type="button" onClick={handleUpload} disabled={!file || isUploading} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
          {isUploading ? 'Uploading…' : 'Upload to Firebase & import'}
        </button>
      </div>

      <div className="mt-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Manage rows</h3>
            <p className="text-xs text-slate-500">{rowTotal.toLocaleString()} matching rows</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={openCreateModal} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
              Add row
            </button>
            <button type="button" onClick={handleDeleteAll} disabled={isDeleting} className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50">
              Delete all
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <input value={rowSearch} onChange={(e) => setRowSearch(e.target.value)} placeholder="Search station, area, blockcode, Urdu text…" className="min-w-[220px] flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          <select value={rowTypeFilter} onChange={(e) => { setRowTypeFilter(e.target.value); setRowPage(1); }} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
            <option value="">All row types</option>
            <option value="Detail">Detail</option>
            <option value="Station Total">Station Total</option>
          </select>
          <select value={stationTypeFilter} onChange={(e) => { setStationTypeFilter(e.target.value); setRowPage(1); }} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
            <option value="">All station types</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="combined">Combined</option>
          </select>
          <button type="button" onClick={() => { setRowPage(1); void loadRows(); }} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
            Search
          </button>
        </div>

        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Code</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Station</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Area</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">M/F/T</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Type</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {rowsLoading ? (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">No rows found</td></tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2 font-mono">{row.blockcode || '—'}</td>
                    <td className="px-3 py-2 max-w-xs truncate" dir="auto" title={row.pollingStation}>{row.pollingStation || '—'}</td>
                    <td className="px-3 py-2 max-w-xs truncate" dir="auto" title={row.areaName}>{row.areaName || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.male}/{row.female}/{row.total}</td>
                    <td className="px-3 py-2">{row.rowType || row.type}</td>
                    <td className="px-3 py-2 whitespace-nowrap space-x-2">
                      <button type="button" onClick={() => openEditModal(row)} className="text-xs font-semibold text-indigo-600 hover:underline">Edit</button>
                      <button type="button" onClick={() => void handleDeleteRow(row.id)} className="text-xs font-semibold text-rose-600 hover:underline">Delete</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
          <span>Page {rowPage} of {totalPages}</span>
          <div className="flex gap-2">
            <button type="button" disabled={rowPage <= 1} onClick={() => setRowPage((p) => Math.max(1, p - 1))} className="rounded-lg border px-3 py-1 disabled:opacity-50">Previous</button>
            <button type="button" disabled={rowPage >= totalPages} onClick={() => setRowPage((p) => p + 1)} className="rounded-lg border px-3 py-1 disabled:opacity-50">Next</button>
          </div>
        </div>
      </div>

      {imports.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-bold text-slate-900">Import history</h3>
          <div className="mt-2 space-y-2">
            {imports.slice(0, 5).map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <div>
                  <p className="font-medium text-slate-800">{item.sourceFileName ?? 'Import'}</p>
                  <p className="text-xs text-slate-500">{item.insertedRows} rows · {item.status}</p>
                </div>
                {item.sourceFileUrl ? (
                  <a href={item.sourceFileUrl} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:underline">Source file</a>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">{editingRow ? 'Edit row' : 'Add row'}</h3>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {([
                ['page', 'Page'],
                ['district', 'District'],
                ['sn', 'Sl No'],
                ['pollingStation', 'Polling Station'],
                ['areaType', 'Area Type'],
                ['areaName', 'Area Name'],
                ['blockcode', 'Electoral Roll Code'],
                ['male', 'Male Voters'],
                ['female', 'Female Voters'],
                ['total', 'Total Voters'],
                ['maleBooth', 'Male Booths'],
                ['femaleBooth', 'Female Booths'],
                ['totalBooth', 'Total Booths'],
                ['rowType', 'Row Type'],
                ['type', 'Station Type'],
              ] as const).map(([key, label]) => (
                <label key={key} className="block text-sm">
                  <span className="font-medium text-slate-700">{label}</span>
                  <input
                    value={form[key]}
                    onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                    dir={key === 'areaName' || key === 'pollingStation' ? 'auto' : undefined}
                  />
                </label>
              ))}
              <label className="block text-sm sm:col-span-2">
                <span className="font-medium text-slate-700">Source Raw Text</span>
                <textarea
                  value={form.sourceRawText}
                  onChange={(e) => setForm((prev) => ({ ...prev, sourceRawText: e.target.value }))}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                  dir="auto"
                />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setModalOpen(false)} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>
              <button type="button" onClick={() => void handleSaveRow()} disabled={savingRow} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {savingRow ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
