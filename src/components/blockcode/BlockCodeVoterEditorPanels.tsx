'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowPathIcon, CheckIcon, MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import type { BlockCodeContext } from '@/lib/blockcode-hub';
import type { PaginatedVotersResponse, VoterBrowseRecord } from '@/lib/voter-browse-types';
import {
  addVoterManual,
  fetchVoterById,
  updateVoter,
  voterToEditForm,
  type VoterAddPayload,
  type VoterEditPayload,
} from '@/lib/voter-edit';
import { formatCnicDisplay } from '@/lib/phone-data';

interface BlockCodeVoterEditPanelProps {
  context: BlockCodeContext;
  onSaved: () => void;
}

interface BlockCodeVoterAddPanelProps {
  context: BlockCodeContext;
  onAdded: () => void;
}

function formatCnicInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 13);
  if (digits.length <= 5) return digits;
  if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return formatCnicDisplay(digits);
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
      {children}
      {required && <span className="text-red-500"> *</span>}
    </label>
  );
}

function inputClassName() {
  return 'mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500';
}

function buildListQuery(blockCode: string, halkaName: string, page: number, limit: number): string {
  const params = new URLSearchParams({
    blockCode,
    halkaName,
    page: String(page),
    limit: String(limit),
  });
  return params.toString();
}

export function BlockCodeVoterEditPanel({ context, onSaved }: BlockCodeVoterEditPanelProps) {
  const { blockCode, halkaName } = context;
  const [voters, setVoters] = useState<VoterBrowseRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<VoterEditPayload>({});
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isLoadingVoter, setIsLoadingVoter] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [cnicQuery, setCnicQuery] = useState('');
  const [isSearchingCnic, setIsSearchingCnic] = useState(false);
  const [isCnicSearchActive, setIsCnicSearchActive] = useState(false);

  const loadList = useCallback(async () => {
    setIsLoadingList(true);
    setListError(null);
    try {
      const response = await fetch(`/api/voters/?${buildListQuery(blockCode, halkaName, 1, 100)}`);
      if (!response.ok) throw new Error('Failed to load voters');
      const data: PaginatedVotersResponse = await response.json();
      setVoters(data.voters);
      setIsCnicSearchActive(false);
    } catch (error) {
      setListError(error instanceof Error ? error.message : 'Failed to load voters');
      setVoters([]);
    } finally {
      setIsLoadingList(false);
    }
  }, [blockCode, halkaName]);

  const selectVoter = useCallback(async (voter: VoterBrowseRecord) => {
    setSelectedId(voter._id);
    setIsLoadingVoter(true);
    setDirty(false);
    try {
      const full = await fetchVoterById(voter._id);
      setForm(voterToEditForm(full));
    } catch {
      setForm(voterToEditForm(voter));
    } finally {
      setIsLoadingVoter(false);
    }
  }, []);

  const searchByCnic = useCallback(async () => {
    const trimmed = cnicQuery.trim();
    if (!trimmed) {
      toast.error('Enter a CNIC to search');
      return;
    }

    setIsSearchingCnic(true);
    setListError(null);
    try {
      const params = new URLSearchParams({
        blockCode,
        halkaName,
        q: trimmed,
        page: '1',
        limit: '50',
      });
      const response = await fetch(`/api/voters/?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to search voters');

      const data: PaginatedVotersResponse = await response.json();
      setVoters(data.voters);
      setIsCnicSearchActive(true);

      if (data.voters.length === 0) {
        toast.error('No voter found with this CNIC in this block');
        setSelectedId(null);
        setForm({});
      } else if (data.voters.length === 1) {
        await selectVoter(data.voters[0]);
      } else {
        toast.success(`${data.voters.length} matches — select one to edit`);
      }
    } catch (error) {
      setListError(error instanceof Error ? error.message : 'Failed to search voters');
      setVoters([]);
    } finally {
      setIsSearchingCnic(false);
    }
  }, [blockCode, halkaName, cnicQuery, selectVoter]);

  const clearCnicSearch = () => {
    setCnicQuery('');
    setIsCnicSearchActive(false);
    void loadList();
  };

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const updateField = <K extends keyof VoterEditPayload>(key: K, value: VoterEditPayload[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setDirty(true);
  };

  const handleSave = useCallback(async () => {
    if (!selectedId) return;

    setIsSaving(true);
    try {
      const updated = await updateVoter(selectedId, form);
      toast.success('Voter saved');
      setDirty(false);
      setVoters((current) => current.map((v) => (v._id === updated._id ? updated : v)));
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save voter');
    } finally {
      setIsSaving(false);
    }
  }, [selectedId, form, onSaved]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 's') {
        event.preventDefault();
        if (selectedId && dirty && !isSaving) {
          void handleSave();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedId, dirty, isSaving, handleSave]);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
      <div className="xl:col-span-4">
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <p className="text-sm font-medium text-gray-900">Select voter to edit</p>
            <button
              type="button"
              onClick={() => void loadList()}
              disabled={isLoadingList}
              className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100"
              title="Refresh list"
            >
              <ArrowPathIcon className={`h-4 w-4 ${isLoadingList ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <form
            className="border-b border-gray-200 px-4 py-3"
            onSubmit={(event) => {
              event.preventDefault();
              void searchByCnic();
            }}
          >
            <label htmlFor="edit-cnic-search" className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Search by CNIC
            </label>
            <div className="mt-1.5 flex gap-2">
              <input
                id="edit-cnic-search"
                type="text"
                value={cnicQuery}
                onChange={(e) => setCnicQuery(formatCnicInput(e.target.value))}
                placeholder="XXXXX-XXXXXXX-X"
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button
                type="submit"
                disabled={isSearchingCnic || !cnicQuery.trim()}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                <MagnifyingGlassIcon className="h-4 w-4" />
              </button>
              {isCnicSearchActive && (
                <button
                  type="button"
                  onClick={clearCnicSearch}
                  className="inline-flex shrink-0 items-center rounded-lg border border-gray-300 px-2.5 py-2 text-gray-500 hover:bg-gray-50"
                  title="Clear search"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              )}
            </div>
            {isCnicSearchActive && (
              <p className="mt-2 text-xs text-indigo-600">
                Showing CNIC search results in block {blockCode}
              </p>
            )}
          </form>
          {listError ? (
            <p className="p-4 text-sm text-red-600">{listError}</p>
          ) : (isLoadingList || isSearchingCnic) && voters.length === 0 ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="h-12 animate-pulse rounded bg-gray-100" />
              ))}
            </div>
          ) : voters.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">
              {isCnicSearchActive ? 'No voter with this CNIC in this block.' : 'No voters in this block yet.'}
            </p>
          ) : (
            <ul className="max-h-[32rem] divide-y divide-gray-100 overflow-y-auto">
              {voters.map((voter, index) => (
                <li key={voter._id}>
                  <button
                    type="button"
                    onClick={() => void selectVoter(voter)}
                    className={`w-full px-4 py-3 text-left hover:bg-gray-50 ${selectedId === voter._id ? 'bg-indigo-50' : ''}`}
                  >
                    <p className="text-xs text-gray-400">#{index + 1} · Silsila {voter.silsilaNo}</p>
                    <p className="font-medium text-gray-900" dir="rtl">{voter.name}</p>
                    <p className="font-mono text-xs text-gray-500">{voter.cnic}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="xl:col-span-8">
        {!selectedId ? (
          <div className="flex min-h-[24rem] items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
            <p className="text-sm text-gray-500">Select a voter from the list to edit serial number, block code, and other fields.</p>
          </div>
        ) : (
          <form
            className="rounded-lg border border-gray-200 bg-white"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSave();
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Edit voter</h3>
                <p className="text-sm text-gray-500">
                  {dirty ? 'Unsaved changes' : 'All changes saved'}
                  <span className="ml-2 text-gray-400">· Ctrl+S to save</span>
                </p>
              </div>
              <button
                type="submit"
                disabled={isSaving || isLoadingVoter || !dirty}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CheckIcon className="h-4 w-4" />
                {isSaving ? 'Saving…' : 'Save changes'}
              </button>
            </div>

            {isLoadingVoter ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 8 }, (_, i) => (
                  <div key={i} className="h-10 animate-pulse rounded bg-gray-100" />
                ))}
              </div>
            ) : (
              <div className="space-y-6 p-5">
                <div className="rounded-lg bg-indigo-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Key fields</p>
                  <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <FieldLabel required>Silsila (serial)</FieldLabel>
                      <input
                        value={form.silsilaNo ?? ''}
                        onChange={(e) => updateField('silsilaNo', e.target.value)}
                        className={inputClassName()}
                        placeholder="Serial number"
                      />
                    </div>
                    <div>
                      <FieldLabel required>Block code</FieldLabel>
                      <input
                        value={form.blockCode ?? ''}
                        onChange={(e) => updateField('blockCode', e.target.value)}
                        className={inputClassName()}
                        placeholder="Block code"
                      />
                    </div>
                    <div>
                      <FieldLabel required>Gharana no.</FieldLabel>
                      <input
                        value={form.gharanaNo ?? ''}
                        onChange={(e) => updateField('gharanaNo', e.target.value)}
                        className={inputClassName()}
                      />
                    </div>
                    <div>
                      <FieldLabel required>CNIC</FieldLabel>
                      <input
                        value={form.cnic ?? ''}
                        onChange={(e) => updateField('cnic', formatCnicInput(e.target.value))}
                        className={`${inputClassName()} font-mono`}
                        placeholder="XXXXX-XXXXXXX-X"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <FieldLabel required>Name</FieldLabel>
                    <input
                      value={form.name ?? ''}
                      onChange={(e) => updateField('name', e.target.value)}
                      className={`${inputClassName()} text-right`}
                      dir="rtl"
                    />
                  </div>
                  <div>
                    <FieldLabel>Father name</FieldLabel>
                    <input
                      value={form.fatherName ?? ''}
                      onChange={(e) => updateField('fatherName', e.target.value)}
                      className={`${inputClassName()} text-right`}
                      dir="rtl"
                    />
                  </div>
                  <div>
                    <FieldLabel>Profession</FieldLabel>
                    <input
                      value={form.profession ?? ''}
                      onChange={(e) => updateField('profession', e.target.value)}
                      className={`${inputClassName()} text-right`}
                      dir="rtl"
                    />
                  </div>
                  <div>
                    <FieldLabel>Age</FieldLabel>
                    <input
                      value={form.age ?? ''}
                      onChange={(e) => updateField('age', e.target.value)}
                      className={inputClassName()}
                    />
                  </div>
                  <div>
                    <FieldLabel>Gender</FieldLabel>
                    <select
                      value={form.gender ?? ''}
                      onChange={(e) => updateField('gender', e.target.value)}
                      className={inputClassName()}
                    >
                      <option value="">—</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                    </select>
                  </div>
                  <div>
                    <FieldLabel>Religion</FieldLabel>
                    <select
                      value={form.religion ?? ''}
                      onChange={(e) => updateField('religion', e.target.value)}
                      className={inputClassName()}
                    >
                      <option value="">—</option>
                      <option value="muslim">Muslim</option>
                      <option value="qadiani">Qadiani</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <FieldLabel>Address</FieldLabel>
                    <textarea
                      value={form.address ?? ''}
                      onChange={(e) => updateField('address', e.target.value)}
                      rows={2}
                      className={`${inputClassName()} text-right`}
                      dir="rtl"
                    />
                  </div>
                </div>

                <details className="rounded-lg border border-gray-200 p-4">
                  <summary className="cursor-pointer text-sm font-medium text-gray-700">Row position (advanced)</summary>
                  <div className="mt-3 grid grid-cols-3 gap-3">
                    <div>
                      <FieldLabel>Row</FieldLabel>
                      <input
                        type="number"
                        value={form.row ?? ''}
                        onChange={(e) => updateField('row', e.target.value ? Number(e.target.value) : undefined)}
                        className={inputClassName()}
                      />
                    </div>
                    <div>
                      <FieldLabel>Row Y</FieldLabel>
                      <input
                        type="number"
                        value={form.rowY ?? ''}
                        onChange={(e) => updateField('rowY', e.target.value ? Number(e.target.value) : undefined)}
                        className={inputClassName()}
                      />
                    </div>
                    <div>
                      <FieldLabel>Row height</FieldLabel>
                      <input
                        type="number"
                        value={form.rowHeight ?? ''}
                        onChange={(e) => updateField('rowHeight', e.target.value ? Number(e.target.value) : undefined)}
                        className={inputClassName()}
                      />
                    </div>
                  </div>
                </details>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

export function BlockCodeVoterAddPanel({ context, onAdded }: BlockCodeVoterAddPanelProps) {
  const { blockCode, halkaName } = context;
  const emptyForm: VoterAddPayload = {
    cnic: '',
    halkaName,
    blockCode,
    silsilaNo: '',
    gharanaNo: '',
    name: '',
    fatherName: '',
    profession: '',
    age: '',
    address: '',
    religion: 'muslim',
    gender: 'male',
  };

  const [form, setForm] = useState<VoterAddPayload>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setForm((current) => ({ ...current, halkaName, blockCode }));
  }, [halkaName, blockCode]);

  const updateField = <K extends keyof VoterAddPayload>(key: K, value: VoterAddPayload[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      const result = await addVoterManual(form);
      toast.success(result.message);
      setForm({ ...emptyForm, halkaName, blockCode });
      onAdded();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add voter');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="mx-auto max-w-3xl rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-5 py-4">
        <h3 className="text-lg font-semibold text-gray-900">Add voter manually</h3>
        <p className="mt-1 text-sm text-gray-500">
          Create a new voter record in block {blockCode} · {halkaName}
        </p>
      </div>

      <div className="space-y-6 p-5">
        <div className="rounded-lg bg-emerald-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Required</p>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel required>Silsila (serial)</FieldLabel>
              <input
                required
                value={form.silsilaNo}
                onChange={(e) => updateField('silsilaNo', e.target.value)}
                className={inputClassName()}
              />
            </div>
            <div>
              <FieldLabel required>Block code</FieldLabel>
              <input
                required
                value={form.blockCode}
                onChange={(e) => updateField('blockCode', e.target.value)}
                className={inputClassName()}
              />
            </div>
            <div>
              <FieldLabel required>Gharana no.</FieldLabel>
              <input
                required
                value={form.gharanaNo}
                onChange={(e) => updateField('gharanaNo', e.target.value)}
                className={inputClassName()}
              />
            </div>
            <div>
              <FieldLabel required>CNIC</FieldLabel>
              <input
                required
                value={form.cnic}
                onChange={(e) => updateField('cnic', formatCnicInput(e.target.value))}
                className={`${inputClassName()} font-mono`}
                placeholder="XXXXX-XXXXXXX-X"
              />
            </div>
            <div className="sm:col-span-2">
              <FieldLabel required>Name</FieldLabel>
              <input
                required
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                className={`${inputClassName()} text-right`}
                dir="rtl"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel>Constituency</FieldLabel>
            <input value={form.halkaName} readOnly className={`${inputClassName()} bg-gray-50 text-gray-600`} />
          </div>
          <div>
            <FieldLabel>Father name</FieldLabel>
            <input
              value={form.fatherName ?? ''}
              onChange={(e) => updateField('fatherName', e.target.value)}
              className={`${inputClassName()} text-right`}
              dir="rtl"
            />
          </div>
          <div>
            <FieldLabel>Gender</FieldLabel>
            <select
              value={form.gender ?? 'male'}
              onChange={(e) => updateField('gender', e.target.value)}
              className={inputClassName()}
            >
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
          <div>
            <FieldLabel>Religion</FieldLabel>
            <select
              value={form.religion ?? 'muslim'}
              onChange={(e) => updateField('religion', e.target.value)}
              className={inputClassName()}
            >
              <option value="muslim">Muslim</option>
              <option value="qadiani">Qadiani</option>
            </select>
          </div>
          <div>
            <FieldLabel>Profession</FieldLabel>
            <input
              value={form.profession ?? ''}
              onChange={(e) => updateField('profession', e.target.value)}
              className={`${inputClassName()} text-right`}
              dir="rtl"
            />
          </div>
          <div>
            <FieldLabel>Age</FieldLabel>
            <input
              value={form.age ?? ''}
              onChange={(e) => updateField('age', e.target.value)}
              className={inputClassName()}
            />
          </div>
          <div className="sm:col-span-2">
            <FieldLabel>Address</FieldLabel>
            <textarea
              value={form.address ?? ''}
              onChange={(e) => updateField('address', e.target.value)}
              rows={2}
              className={`${inputClassName()} text-right`}
              dir="rtl"
            />
          </div>
        </div>
      </div>

      <div className="border-t border-gray-200 px-5 py-4">
        <button
          type="submit"
          disabled={isSaving}
          className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 sm:w-auto"
        >
          {isSaving ? 'Adding voter…' : 'Add voter'}
        </button>
      </div>
    </form>
  );
}
