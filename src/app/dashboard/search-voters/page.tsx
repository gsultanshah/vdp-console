'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowDownTrayIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import PhoneDataPanel, { type PhoneDataResult } from '@/components/voters/PhoneDataPanel';
import PhoneDataForm from '@/components/voters/PhoneDataForm';
import VoterRowPreview from '@/components/voters/VoterRowPreview';
import VoterCellsPanel from '@/components/voters/VoterCellsPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatGenderFromCnic, genderFromCnic } from '@/lib/cnic';
import type { VoterReproductionData } from '@/lib/voter-document';
import type { VoterTableCell } from '@/lib/voter-cells';
import toast from 'react-hot-toast';
import { Progress } from '@/components/ui/progress';
import { usePhoneEnrich } from '@/hooks/usePhoneEnrich';

interface Voter {
  _id: string;
  cnic: string;
  halkaName: string;
  blockCode: string;
  silsilaNo: string;
  gharanaNo: string;
  name: string;
  row: number;
  rowY: number;
  rowHeight: number;
  imageUrl: string;
  gender?: string;
  religion?: string;
  pageTag?: string;
  fileName?: string;
  fatherName?: string;
  profession?: string;
  age?: string;
  address?: string;
  previousAddress?: string;
  cells?: VoterTableCell[];
  reproduction?: VoterReproductionData;
  createdAt: string;
  updatedAt: string;
}

interface PollingInfo {
  _id: string;
  sn: string;
  polling_station_name: string;
  area: string;
  blockcode: number;
  male: number;
  female: number;
  total: number;
  male_booth: string;
  female_booth: string;
  total_booth: string;
  halkaName: string;
  type: string;
}

interface PhoneSearchResponse {
  configured?: boolean;
  count?: number;
  results?: PhoneDataResult[];
  error?: string;
  details?: string;
}

function VoterMetaFields({ voter }: { voter: Voter }) {
  const fields = [
    { label: 'Row', value: voter.row != null ? String(voter.row) : undefined },
    { label: 'Religion', value: voter.religion },
  ].filter((field) => field.value);

  if (!fields.length) {
    return null;
  }

  return (
    <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
      {fields.map((field) => (
        <div key={field.label}>
          <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{field.label}</dt>
          <dd className="mt-1 text-sm text-gray-900">{field.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function VoterResultCard({ voter, showFamilyHeading }: { voter: Voter; showFamilyHeading?: boolean }) {
  const hasRowPreview = voter.rowY != null && voter.rowHeight != null;
  const gender = formatGenderFromCnic(voter.cnic);

  return (
    <div className="border-b border-gray-200 bg-white last:border-b-0">
      <div className="px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 text-right">
            <p className="text-2xl font-bold text-gray-900">{voter.name}</p>
            {voter.gharanaNo && (
              <p className="mt-1 text-sm text-gray-600">{voter.gharanaNo}</p>
            )}
          </div>
          <a
            href={voter.imageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
          >
            Full page
          </a>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <div>
            <dt className="text-xs font-medium uppercase text-gray-500">CNIC</dt>
            <dd className="mt-1 font-mono text-sm text-gray-900">{voter.cnic}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-gray-500">Halka</dt>
            <dd className="mt-1 text-sm text-gray-900">{voter.halkaName}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-gray-500">Block</dt>
            <dd className="mt-1 text-sm text-gray-900">{voter.blockCode}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-gray-500">Silsila</dt>
            <dd className="mt-1 text-sm text-gray-900">{voter.silsilaNo}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-gray-500">Name</dt>
            <dd className="mt-1 text-sm text-gray-900">{voter.gharanaNo}</dd>
          </div>
          {gender && (
            <div>
              <dt className="text-xs font-medium uppercase text-gray-500">Gender</dt>
              <dd className="mt-1 text-sm text-gray-900">{gender}</dd>
            </div>
          )}
        </dl>

        <VoterMetaFields voter={voter} />

        <VoterCellsPanel
          halkaName={voter.halkaName}
          cnic={voter.cnic}
          cells={voter.cells}
          reproduction={voter.reproduction}
        />
      </div>

      {hasRowPreview && (
        <div className="border-t border-gray-100 bg-gray-50 px-6 py-4">
          <VoterRowPreview
            imageUrl={voter.imageUrl}
            rowY={voter.rowY}
            rowHeight={voter.rowHeight}
            reproduction={voter.reproduction}
            label={showFamilyHeading ? voter.name : 'Voter row'}
          />
        </div>
      )}
    </div>
  );
}

function formatCNIC(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 5) {
    return digits;
  }
  if (digits.length <= 12) {
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  }
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12, 13)}`;
}

function formatPhoneInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 4) {
    return digits;
  }
  return `${digits.slice(0, 4)}-${digits.slice(4)}`;
}

async function fetchPhoneData(params: { cnic?: string; phone?: string }): Promise<{
  results: PhoneDataResult[];
  error: string | null;
  notConfigured: boolean;
}> {
  const query = new URLSearchParams();
  if (params.cnic) {
    query.set('cnic', params.cnic);
  }
  if (params.phone) {
    query.set('phone', params.phone);
  }

  const response = await fetch(`/api/phone-data/search?${query.toString()}`);
  const data = (await response.json()) as PhoneSearchResponse;

  if (response.status === 503) {
    return { results: [], error: null, notConfigured: true };
  }

  if (!response.ok) {
    return {
      results: [],
      error: data.details || data.error || 'Phone data search failed',
      notConfigured: false,
    };
  }

  return {
    results: data.results ?? [],
    error: null,
    notConfigured: false,
  };
}

export default function SearchVoters() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState('voter');

  const [searchQuery, setSearchQuery] = useState('');
  const [voters, setVoters] = useState<Voter[]>([]);
  const [pollingInfo, setPollingInfo] = useState<PollingInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showFamily, setShowFamily] = useState(false);
  const [isLoadingPolling, setIsLoadingPolling] = useState(false);

  const [phoneResults, setPhoneResults] = useState<PhoneDataResult[]>([]);
  const [isLoadingPhone, setIsLoadingPhone] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [phoneNotConfigured, setPhoneNotConfigured] = useState(false);

  const [phoneCnicQuery, setPhoneCnicQuery] = useState('');
  const [phoneNumberQuery, setPhoneNumberQuery] = useState('');
  const [phoneTabResults, setPhoneTabResults] = useState<PhoneDataResult[]>([]);
  const [isLoadingPhoneTab, setIsLoadingPhoneTab] = useState(false);
  const [phoneTabError, setPhoneTabError] = useState<string | null>(null);
  const [phoneTabNotConfigured, setPhoneTabNotConfigured] = useState(false);

  const [isAdmin, setIsAdmin] = useState(false);
  const [editingPhoneRecord, setEditingPhoneRecord] = useState<PhoneDataResult | null>(null);

  const [enrichFile, setEnrichFile] = useState<File | null>(null);
  const {
    job: enrichJob,
    isStarting: isEnrichStarting,
    isProcessing: isEnrichProcessing,
    startEnrich,
    downloadResult,
    cancelProcessing,
  } = usePhoneEnrich();

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) {
      return;
    }

    try {
      const user = JSON.parse(userStr) as { role?: string };
      setIsAdmin(user.role === 'admin');
    } catch {
      setIsAdmin(false);
    }
  }, []);

  const upsertPhoneResult = useCallback((prev: PhoneDataResult[], record: PhoneDataResult) => {
    const key = `${record.cnic}-${record.phone}`;
    return [record, ...prev.filter((item) => `${item.cnic}-${item.phone}` !== key)];
  }, []);

  const voterTabCnic = voters[0]?.cnic || searchQuery.trim();

  const loadPhoneDataForCnic = useCallback(async (cnic: string) => {
    setIsLoadingPhone(true);
    setPhoneError(null);
    setPhoneNotConfigured(false);
    setPhoneResults([]);

    try {
      const result = await fetchPhoneData({ cnic });
      setPhoneResults(result.results);
      setPhoneError(result.error);
      setPhoneNotConfigured(result.notConfigured);
    } catch {
      setPhoneError('Failed to load phone data');
    } finally {
      setIsLoadingPhone(false);
    }
  }, []);

  const searchByCnic = useCallback(
    async (cnic: string) => {
      const query = cnic.trim();
      if (!query) {
        return;
      }

      setSearchQuery(query);
      setIsLoading(true);
      setShowFamily(false);
      setPollingInfo(null);
      setPhoneResults([]);
      setPhoneError(null);

      try {
        const response = await fetch(`/api/voters/search?cnic=${encodeURIComponent(query)}`);
        const data = await response.json();
        const voter = Array.isArray(data) && data.length > 0 ? (data[0] as Voter) : null;

        if (voter) {
          setVoters([voter]);
          void loadPhoneDataForCnic(voter.cnic);

          setIsLoadingPolling(true);
          try {
            const pollingType = genderFromCnic(voter.cnic) ?? 'male';
            const pollingResponse = await fetch(
              `/api/polling-scheme?halkaName=${encodeURIComponent(voter.halkaName)}&blockcode=${encodeURIComponent(voter.blockCode)}&type=${pollingType}`
            );
            if (pollingResponse.ok) {
              const pollingData = await pollingResponse.json();
              setPollingInfo(pollingData);
            }
          } catch (error) {
            console.error('Error fetching polling information:', error);
          } finally {
            setIsLoadingPolling(false);
          }
        } else {
          setVoters([]);
          void loadPhoneDataForCnic(query);
        }
      } catch (error) {
        console.error('Error searching voters:', error);
      } finally {
        setIsLoading(false);
      }
    },
    [loadPhoneDataForCnic]
  );

  useEffect(() => {
    const cnicFromUrl = searchParams.get('cnic');
    if (cnicFromUrl) {
      void searchByCnic(cnicFromUrl);
    }
  }, [searchParams, searchByCnic]);

  const handleVoterSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await searchByCnic(searchQuery);
  };

  const handlePhoneRecordSaved = (record: PhoneDataResult) => {
    setPhoneResults((prev) => upsertPhoneResult(prev, record));
    setPhoneTabResults((prev) => upsertPhoneResult(prev, record));
    setEditingPhoneRecord(null);
    setPhoneCnicQuery(formatCNIC(record.cnic));
    setPhoneNumberQuery(record.phoneDisplay ? record.phoneDisplay : formatPhoneInput(record.phone));
    setPhoneTabError(null);
    setPhoneTabNotConfigured(false);

    const refreshCnic = record.cnic || voterTabCnic;
    if (refreshCnic) {
      void loadPhoneDataForCnic(refreshCnic);
    }
  };

  const handleEditPhoneRecord = (record: PhoneDataResult) => {
    setEditingPhoneRecord(record);
  };

  const handlePhoneTabSearch = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!phoneCnicQuery && !phoneNumberQuery) {
      return;
    }

    setIsLoadingPhoneTab(true);
    setPhoneTabError(null);
    setPhoneTabNotConfigured(false);
    setPhoneTabResults([]);

    try {
      const result = await fetchPhoneData({
        cnic: phoneCnicQuery || undefined,
        phone: phoneNumberQuery || undefined,
      });
      setPhoneTabResults(result.results);
      setPhoneTabError(result.error);
      setPhoneTabNotConfigured(result.notConfigured);
    } catch {
      setPhoneTabError('Failed to search phone data');
    } finally {
      setIsLoadingPhoneTab(false);
    }
  };

  const handleShowFamily = async () => {
    if (voters.length === 0) return;

    setIsLoading(true);
    try {
      const voter = voters[0];
      const response = await fetch(
        `/api/voters/family?blockCode=${encodeURIComponent(voter.blockCode)}&gharanaNo=${encodeURIComponent(voter.gharanaNo)}`
      );
      const data = await response.json();
      setVoters(data);
      setShowFamily(true);
    } catch (error) {
      console.error('Error fetching family members:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEnrichUpload = async () => {
    if (!enrichFile) {
      toast.error('Select an Excel file first.');
      return;
    }
    try {
      const finalJob = await startEnrich(enrichFile);
      if (finalJob?.downloadReady) {
        await downloadResult(finalJob.id);
        setEnrichFile(null);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to enrich file');
    }
  };

  const enrichBusy = isEnrichStarting || isEnrichProcessing;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Search Voters
          </h1>
          <p className="mt-3 text-lg text-gray-500">
            Search voter records and linked phone data
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-10">
          <TabsList className="mx-auto flex w-full max-w-md bg-gray-100">
            <TabsTrigger value="voter" className="flex-1">
              Voter search
            </TabsTrigger>
            <TabsTrigger value="phone" className="flex-1">
              Phone data
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="bulk" className="flex-1">
                Bulk enrich
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="voter" className="mt-8 space-y-8">
            <form onSubmit={handleVoterSearch} className="mx-auto max-w-3xl">
              <div className="flex gap-4">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value.replace(/\D/g, '').length <= 13) {
                        setSearchQuery(formatCNIC(value));
                      }
                    }}
                    placeholder="Enter CNIC (e.g., 34104-2955553-6)"
                    className="block w-full rounded-lg border-0 py-4 pl-4 pr-12 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-4">
                    <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="rounded-lg bg-indigo-600 px-6 py-4 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isLoading ? 'Searching...' : 'Search'}
                </button>
              </div>
            </form>

            {voters.length > 0 ? (
              <div className="space-y-6">
                <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
                  <div className="flex items-center justify-between bg-gray-50 px-6 py-4">
                    <h3 className="text-lg font-medium text-gray-900">
                      {showFamily ? 'Family Members' : 'Voter Details'}
                    </h3>
                    {!showFamily && (
                      <button
                        type="button"
                        onClick={handleShowFamily}
                        disabled={isLoading}
                        className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isLoading ? 'Loading...' : 'Show Family'}
                      </button>
                    )}
                  </div>

                  {voters.map((voter) => (
                    <Fragment key={voter._id}>
                      <VoterResultCard voter={voter} showFamilyHeading={showFamily} />
                    </Fragment>
                  ))}
                </div>

                <PhoneDataPanel
                  title="Linked phone data"
                  results={phoneResults}
                  isLoading={isLoadingPhone}
                  error={phoneError}
                  notConfigured={phoneNotConfigured}
                  emptyMessage="No phone records found for this CNIC."
                  isAdmin={isAdmin}
                  onEdit={handleEditPhoneRecord}
                />

                {isAdmin && voterTabCnic && (
                  <PhoneDataForm
                    isAdmin
                    notConfigured={phoneNotConfigured}
                    defaultCnic={voterTabCnic}
                    editingRecord={editingPhoneRecord}
                    onSaved={handlePhoneRecordSaved}
                    onCancel={() => setEditingPhoneRecord(null)}
                  />
                )}

                {isLoadingPolling ? (
                  <div className="py-4 text-center">
                    <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-indigo-600" />
                    <p className="mt-2 text-sm text-gray-500">Loading polling information...</p>
                  </div>
                ) : pollingInfo ? (
                  <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
                    <div className="bg-gray-50 px-6 py-4">
                      <h3 className="text-lg font-medium text-gray-900">Polling Information</h3>
                    </div>
                    <div className="bg-white px-6 py-4">
                      <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Polling Station</dt>
                          <dd className="mt-1 text-sm text-gray-900">{pollingInfo.polling_station_name}</dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Area</dt>
                          <dd className="mt-1 text-sm text-gray-900">{pollingInfo.area}</dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Serial Number</dt>
                          <dd className="mt-1 text-sm text-gray-900">{pollingInfo.sn}</dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Type</dt>
                          <dd className="mt-1 text-sm capitalize text-gray-900">{pollingInfo.type}</dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Booth Number</dt>
                          <dd className="mt-1 text-sm text-gray-900">
                            {pollingInfo.type === 'male'
                              ? pollingInfo.male_booth || 'N/A'
                              : pollingInfo.female_booth || 'N/A'}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              !isLoading && (
                <div className="space-y-6">
                  <p className="text-center text-gray-500">
                    No voters found. Try searching with a CNIC number.
                  </p>
                  {(phoneResults.length > 0 || isLoadingPhone || phoneError || phoneNotConfigured) && (
                    <PhoneDataPanel
                      title="Phone data for CNIC"
                      results={phoneResults}
                      isLoading={isLoadingPhone}
                      error={phoneError}
                      notConfigured={phoneNotConfigured}
                      emptyMessage="No phone records found for this CNIC."
                      isAdmin={isAdmin}
                      onEdit={handleEditPhoneRecord}
                    />
                  )}
                  {isAdmin && searchQuery.trim() && (
                    <PhoneDataForm
                      isAdmin
                      notConfigured={phoneNotConfigured}
                      defaultCnic={searchQuery.trim()}
                      editingRecord={editingPhoneRecord}
                      onSaved={handlePhoneRecordSaved}
                      onCancel={() => setEditingPhoneRecord(null)}
                    />
                  )}
                </div>
              )
            )}
          </TabsContent>

          <TabsContent value="phone" className="mt-8 space-y-8">
            <form onSubmit={handlePhoneTabSearch} className="mx-auto max-w-3xl space-y-4">
              <div>
                <label htmlFor="phone-cnic" className="mb-1 block text-sm font-medium text-gray-700">
                  CNIC
                </label>
                <input
                  id="phone-cnic"
                  type="text"
                  value={phoneCnicQuery}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value.replace(/\D/g, '').length <= 13) {
                      setPhoneCnicQuery(formatCNIC(value));
                    }
                  }}
                  placeholder="35101-2509021-5"
                  className="block w-full rounded-lg border-0 py-3 px-4 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
                />
              </div>
              <div>
                <label htmlFor="phone-number" className="mb-1 block text-sm font-medium text-gray-700">
                  Phone (optional)
                </label>
                <input
                  id="phone-number"
                  type="text"
                  value={phoneNumberQuery}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value.replace(/\D/g, '').length <= 11) {
                      setPhoneNumberQuery(formatPhoneInput(value));
                    }
                  }}
                  placeholder="0301-7989554"
                  className="block w-full rounded-lg border-0 py-3 px-4 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Search by CNIC (all linked phones), phone only, or both for an exact match.
                </p>
              </div>
              <button
                type="submit"
                disabled={isLoadingPhoneTab || (!phoneCnicQuery && !phoneNumberQuery)}
                className="w-full rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {isLoadingPhoneTab ? 'Searching...' : 'Search phone data'}
              </button>
            </form>

            <PhoneDataPanel
              title="Phone search results"
              results={phoneTabResults}
              isLoading={isLoadingPhoneTab}
              error={phoneTabError}
              notConfigured={phoneTabNotConfigured}
              emptyMessage="No phone records matched your search."
              isAdmin={isAdmin}
              onEdit={handleEditPhoneRecord}
            />

            <PhoneDataForm
              isAdmin={isAdmin}
              notConfigured={phoneTabNotConfigured}
              defaultCnic={phoneCnicQuery}
              editingRecord={editingPhoneRecord}
              onSaved={handlePhoneRecordSaved}
              onCancel={() => setEditingPhoneRecord(null)}
            />
          </TabsContent>

          {isAdmin && (
            <TabsContent value="bulk" className="mt-8 space-y-6">
              <div className="mx-auto max-w-3xl rounded-lg bg-white p-6 shadow ring-1 ring-black/5">
                <h2 className="text-lg font-semibold text-gray-900">Upload Excel → enrich phone data</h2>
                <p className="mt-1 text-sm text-gray-600">
                  Upload an Excel file containing a CNIC column. We will look up phone numbers from phone data and
                  join voter info (name/address/etc) from the server database, then download a new Excel file.
                </p>
                <p className="mt-2 text-xs text-gray-500">
                  Limits: max 10,000 rows per upload. For millions of records, use the CLI utility.
                </p>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={(e) => setEnrichFile(e.target.files?.[0] ?? null)}
                    className="text-sm"
                    disabled={enrichBusy}
                  />
                  <button
                    type="button"
                    onClick={() => void handleEnrichUpload()}
                    disabled={!enrichFile || enrichBusy}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
                  >
                    <ArrowDownTrayIcon className="h-4 w-4" />
                    {enrichBusy ? 'Processing…' : 'Download enriched Excel'}
                  </button>
                  {isEnrichProcessing && (
                    <button
                      type="button"
                      onClick={cancelProcessing}
                      className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      Stop after current batch
                    </button>
                  )}
                </div>

                {enrichJob && (
                  <div className="mt-4 rounded-lg border border-indigo-100 bg-indigo-50/50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="font-medium text-indigo-900">
                        {enrichJob.status === 'completed'
                          ? 'Complete'
                          : enrichJob.status === 'failed'
                            ? 'Failed'
                            : 'Processing…'}
                      </span>
                      <span className="text-indigo-700">
                        {enrichJob.processedInputRows.toLocaleString()} / {enrichJob.totalInputRows.toLocaleString()} CNICs
                        {' · '}
                        {enrichJob.outputRowCount.toLocaleString()} output rows
                      </span>
                    </div>
                    <Progress value={enrichJob.progressPercent} className="mt-2 h-2" />
                    {enrichJob.error && (
                      <p className="mt-2 text-xs text-rose-700">{enrichJob.error}</p>
                    )}
                    {enrichJob.downloadReady && enrichJob.status !== 'running' && (
                      <button
                        type="button"
                        onClick={() => void downloadResult(enrichJob.id)}
                        className="mt-3 text-sm font-semibold text-indigo-600 hover:underline"
                      >
                        Download result again
                      </button>
                    )}
                  </div>
                )}
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
