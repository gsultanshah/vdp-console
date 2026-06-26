'use client';

import { Fragment, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Menu, Transition } from '@headlessui/react';
import {
  TableCellsIcon,
  PhotoIcon,
  EllipsisVerticalIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { canSeeProcessButtons } from '@/lib/utils';
import ImageViewerModal, { type UploadImage } from '@/components/constituency/ImageViewerModal';
import UploadUrlsTableModal, { type UploadQueryParams } from '@/components/constituency/UploadUrlsTableModal';

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

interface BlockCode extends UploadImage {}

interface Estimate {
  _id: string;
  muslimFemale: number;
  muslimMale: number;
  qadianiFemale: number;
  qadianiMale: number;
  totalVoters: number;
  estimatedAt: string;
}

interface Constituency {
  _id: string;
  halkaName: string;
  muslimFemale: number;
  muslimMale: number;
  qadianiFemale: number;
  qadianiMale: number;
  totalVoters: number;
  blockCodes: string[];
  lastUpdated: string;
  estimates: Estimate[];
  status?: 'active' | 'inactive';
}

type ConfirmAction =
  | { type: 'inactive'; constituency: Constituency }
  | { type: 'activate'; constituency: Constituency }
  | { type: 'delete'; constituency: Constituency };

interface BlockCodeStats {
  totalFiles: number;
  estimatedVoters: number;
  estimatedReligion: {
    min: number;
    max: number;
  };
  estimatedGender: {
    min: number;
    max: number;
  };
}

interface VoterStats {
  totalFiles: number;
  totalMuslimVoters: {
    min: number;
    max: number;
  };
  totalMale: {
    min: number;
    max: number;
  };
  totalFemale: {
    min: number;
    max: number;
  };
}

interface EstimationProgress {
  current: number;
  total: number;
  isEstimating: boolean;
}

interface ProcessingProgress {
  current: number;
  total: number;
  isProcessing: boolean;
  created: number;
  enriched: number;
  errors: number;
  ocrRun: number;
}

export default function ConstituencyPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [constituencies, setConstituencies] = useState<Constituency[]>([]);
  const [selectedConstituency, setSelectedConstituency] = useState<Constituency | null>(null);
  const [blockCodeStats, setBlockCodeStats] = useState<Record<string, BlockCodeStats>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isEstimating, setIsEstimating] = useState<Record<string, boolean>>({});
  const [estimationProgress, setEstimationProgress] = useState<Record<string, EstimationProgress>>({});
  const [showEstimates, setShowEstimates] = useState<Record<string, boolean>>({});
  const [isUpdatingCount, setIsUpdatingCount] = useState<Record<string, boolean>>({});
  const [showVoterStats, setShowVoterStats] = useState<boolean>(false);
  const [selectedBlockCode, setSelectedBlockCode] = useState<string>('');
  const [voterStats, setVoterStats] = useState<VoterStats | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingProgress, setProcessingProgress] = useState<ProcessingProgress>({
    current: 0,
    total: 0,
    isProcessing: false,
    created: 0,
    enriched: 0,
    errors: 0,
    ocrRun: 0,
  });
  const [showUploadsTable, setShowUploadsTable] = useState(false);
  const [uploadsTableTitle, setUploadsTableTitle] = useState('');
  const [uploadsQueryParams, setUploadsQueryParams] = useState<UploadQueryParams | null>(null);
  const [showImageViewer, setShowImageViewer] = useState(false);
  const [imageViewerIndex, setImageViewerIndex] = useState(0);
  const [viewerUploads, setViewerUploads] = useState<UploadImage[]>([]);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);

  useEffect(() => {
    const isAuthenticated = localStorage.getItem('isAuthenticated');
    const userData = localStorage.getItem('user');
    
    if (!isAuthenticated || !userData) {
      router.push('/signin');
      return;
    }

    setUser(JSON.parse(userData));
  }, [router]);

  useEffect(() => {
    fetchConstituencies();
  }, []);

  const fetchConstituencies = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/constituency');
      const data = await response.json();
      setConstituencies(data);
    } catch (error) {
      console.error('Failed to fetch constituencies:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUploadsPage = async (
    params: UploadQueryParams,
    page = 1,
    limit = 50
  ) => {
    const query = params.blockCode
      ? `blockCode=${encodeURIComponent(params.blockCode)}`
      : `halkaName=${encodeURIComponent(params.halkaName!)}`;
    const response = await fetch(`/api/blockcodes?${query}&page=${page}&limit=${limit}`);
    if (!response.ok) throw new Error('Failed to fetch uploads');
    return response.json();
  };

  const openUploadsTable = (title: string, params: UploadQueryParams) => {
    setUploadsTableTitle(title);
    setUploadsQueryParams(params);
    setShowUploadsTable(true);
  };

  const openImageViewer = async (params: UploadQueryParams) => {
    try {
      const data = await fetchUploadsPage(params, 1, 50);
      if (!data.uploads?.length) {
        alert('No uploaded images found');
        return;
      }
      setViewerUploads(data.uploads);
      setImageViewerIndex(0);
      setShowImageViewer(true);
      setShowUploadsTable(false);
    } catch (error) {
      console.error('Failed to fetch uploads:', error);
      alert('Failed to load images');
    }
  };

  const handleViewImageFromTable = (
    _upload: UploadImage,
    pageUploads: UploadImage[],
    indexInPage: number
  ) => {
    setViewerUploads(pageUploads);
    setImageViewerIndex(indexInPage);
    setShowImageViewer(true);
  };

  const isConstituencyInactive = (constituency: Constituency) =>
    constituency.status === 'inactive';

  const handleConfirmAction = async () => {
    if (!confirmAction) return;

    setIsActionLoading(true);
    try {
      if (confirmAction.type === 'delete') {
        const response = await fetch(
          `/api/constituency?id=${confirmAction.constituency._id}`,
          { method: 'DELETE' }
        );
        if (!response.ok) throw new Error('Failed to delete constituency');

        setConstituencies((prev) =>
          prev.filter((c) => c._id !== confirmAction.constituency._id)
        );
        if (selectedConstituency?._id === confirmAction.constituency._id) {
          setSelectedConstituency(null);
        }
        toast.success(`${confirmAction.constituency.halkaName} deleted`);
      } else {
        const newStatus = confirmAction.type === 'inactive' ? 'inactive' : 'active';
        const response = await fetch('/api/constituency', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            _id: confirmAction.constituency._id,
            status: newStatus,
          }),
        });
        if (!response.ok) throw new Error('Failed to update constituency status');

        const updated = await response.json();
        setConstituencies((prev) =>
          prev.map((c) => (c._id === updated._id ? updated : c))
        );
        if (selectedConstituency?._id === updated._id) {
          setSelectedConstituency(updated);
        }
        toast.success(
          newStatus === 'inactive'
            ? `${confirmAction.constituency.halkaName} is now inactive`
            : `${confirmAction.constituency.halkaName} is now active`
        );
      }
      setConfirmAction(null);
    } catch (error) {
      console.error('Constituency action failed:', error);
      toast.error('Action failed. Please try again.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const estimateBlockCodeStats = async (blockCode: string) => {
    try {
      setIsEstimating(prev => ({ ...prev, [blockCode]: true }));
      const response = await fetch(`/api/blockcodes?blockCode=${blockCode}`);
      const data: BlockCode[] = await response.json();
      
      const totalFiles = data.length;
      const estimatedVoters = totalFiles * 28;
      const estimatedReligion = {
        min: estimatedVoters - 31,
        max: estimatedVoters + 31
      };
      const estimatedGender = {
        min: estimatedVoters - 31,
        max: estimatedVoters + 31
      };

      setBlockCodeStats(prev => ({
        ...prev,
        [blockCode]: {
          totalFiles,
          estimatedVoters,
          estimatedReligion,
          estimatedGender
        }
      }));
    } catch (error) {
      console.error('Failed to estimate block code stats:', error);
    } finally {
      setIsEstimating(prev => ({ ...prev, [blockCode]: false }));
    }
  };

  const estimateConstituency = async (constituency: Constituency) => {
    try {
      setEstimationProgress(prev => ({
        ...prev,
        [constituency._id]: {
          current: 0,
          total: constituency.blockCodes.length,
          isEstimating: true
        }
      }));

      let totalMuslimMale = 0;
      let totalMuslimFemale = 0;
      let totalQadianiMale = 0;
      let totalQadianiFemale = 0;

      for (let i = 0; i < constituency.blockCodes.length; i++) {
        const blockCode = constituency.blockCodes[i];
        const response = await fetch(`/api/blockcodes?blockCode=${blockCode}`);
        const data: BlockCode[] = await response.json();

        // Calculate statistics for this block code
        const totalFiles = data.length;
        const estimatedVoters = totalFiles * 28;

        // Update progress
        setEstimationProgress(prev => ({
          ...prev,
          [constituency._id]: {
            ...prev[constituency._id],
            current: i + 1
          }
        }));

        // Update running totals
        totalMuslimMale += data.filter(d => d.religion === 'muslim' && d.gender === 'male').length * 28;
        totalMuslimFemale += data.filter(d => d.religion === 'muslim' && d.gender === 'female').length * 28;
        totalQadianiMale += data.filter(d => d.religion === 'qadiani' && d.gender === 'male').length * 28;
        totalQadianiFemale += data.filter(d => d.religion === 'qadiani' && d.gender === 'female').length * 28;

        // Update block code stats
        setBlockCodeStats(prev => ({
          ...prev,
          [blockCode]: {
            totalFiles,
            estimatedVoters,
            estimatedReligion: {
              min: estimatedVoters - 31,
              max: estimatedVoters + 31
            },
            estimatedGender: {
              min: estimatedVoters - 31,
              max: estimatedVoters + 31
            }
          }
        }));
      }

      const totalVoters = totalMuslimMale + totalMuslimFemale + totalQadianiMale + totalQadianiFemale;

      // Create new estimate
      const newEstimate = {
        muslimMale: totalMuslimMale,
        muslimFemale: totalMuslimFemale,
        qadianiMale: totalQadianiMale,
        qadianiFemale: totalQadianiFemale,
        totalVoters,
        estimatedAt: new Date().toISOString()
      };

      // Save to database
      const response = await fetch('/api/constituency', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          _id: constituency._id,
          estimates: [...(constituency.estimates || []), newEstimate]
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save constituency data');
      }

      const savedConstituency = await response.json();

      // Update local state with saved data
      setConstituencies(prev => 
        prev.map(c => c._id === constituency._id ? savedConstituency : c)
      );

    } catch (error) {
      console.error('Failed to estimate constituency:', error);
    } finally {
      setEstimationProgress(prev => ({
        ...prev,
        [constituency._id]: {
          ...prev[constituency._id],
          isEstimating: false
        }
      }));
    }
  };

  const updateFromEstimate = async (constituencyId: string, estimateId: string) => {
    try {
      setIsUpdatingCount(prev => ({ ...prev, [estimateId]: true }));
      
      const response = await fetch('/api/constituency', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          _id: constituencyId,
          updateFromEstimate: estimateId
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update constituency counts');
      }

      const updatedConstituency = await response.json();
      
      // Update local state with the new counts
      setConstituencies(prev => 
        prev.map(c => c._id === constituencyId ? updatedConstituency : c)
      );

    } catch (error) {
      console.error('Failed to update constituency counts:', error);
    } finally {
      setIsUpdatingCount(prev => ({ ...prev, [estimateId]: false }));
    }
  };

  const processVoterStats = async (blockCode: string) => {
    try {
      setSelectedBlockCode(blockCode);
      const response = await fetch(`/api/blockcodes?blockCode=${blockCode}`);
      const data: BlockCode[] = await response.json();
      
      const totalFiles = data.length;
      const maleFiles = data.filter(d => d.gender === 'male').length;
      const femaleFiles = data.filter(d => d.gender === 'female').length;
      
      const stats: VoterStats = {
        totalFiles,
        totalMuslimVoters: {
          min: (totalFiles * 28) - 31,
          max: (totalFiles * 28) + 27
        },
        totalMale: {
          min: (maleFiles * 28) - 31,
          max: (maleFiles * 28) + 27
        },
        totalFemale: {
          min: (femaleFiles * 28) - 31,
          max: (femaleFiles * 28) + 27
        }
      };
      
      setVoterStats(stats);
      setShowVoterStats(true);
    } catch (error) {
      console.error('Failed to process voter stats:', error);
    }
  };

  const initiateProcess = async () => {
    try {
      setIsProcessing(true);
      setProcessingProgress({
        current: 0,
        total: 0,
        isProcessing: true,
        created: 0,
        enriched: 0,
        errors: 0,
        ocrRun: 0,
      });

      const response = await fetch(`/api/blockcodes?blockCode=${selectedBlockCode}`);
      const blockCodeDocs: BlockCode[] = await response.json();
      const pages = blockCodeDocs.filter((doc) => doc.tag !== 'title');

      setProcessingProgress((prev) => ({
        ...prev,
        total: pages.length,
      }));

      let created = 0;
      let enriched = 0;
      let unchanged = 0;
      let errors = 0;
      let ocrRun = 0;

      for (let i = 0; i < pages.length; i++) {
        const doc = pages[i];

        try {
          const processResponse = await fetch(
            `/api/blockcodes/process-enrich?page_id=${encodeURIComponent(doc._id)}`
          );
          const data = await processResponse.json();

          if (!processResponse.ok) {
            throw new Error(data.details || data.error || 'Processing failed');
          }

          created += data.enrich?.created ?? 0;
          enriched += data.enrich?.enriched ?? 0;
          unchanged += data.enrich?.unchanged ?? 0;
          errors += data.enrich?.errors ?? 0;
          if (!data.ocr_skipped) {
            ocrRun += 1;
          }
        } catch (docError) {
          console.error('Error processing document:', docError);
          errors += 1;
        }

        setProcessingProgress({
          current: i + 1,
          total: pages.length,
          isProcessing: true,
          created,
          enriched,
          errors,
          ocrRun,
        });
      }

      toast.success(
        `Processing complete — ${created} created, ${enriched} enriched, ${unchanged} unchanged, ${ocrRun} OCR run, ${errors} errors`
      );
      setShowVoterStats(false);
    } catch (error) {
      console.error('Failed to initiate process:', error);
      toast.error('Failed to process voters. Check the console for details.');
    } finally {
      setIsProcessing(false);
      setProcessingProgress({
        current: 0,
        total: 0,
        isProcessing: false,
        created: 0,
        enriched: 0,
        errors: 0,
        ocrRun: 0,
      });
    }
  };

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-2xl font-semibold text-gray-900">Constituencies</h1>
          <p className="mt-2 text-sm text-gray-700">
            A list of all constituencies with their voter statistics and block codes.
          </p>
        </div>
      </div>

      {/* Constituency Cards */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          <div className="col-span-full text-center py-4">Loading...</div>
        ) : constituencies.length === 0 ? (
          <div className="col-span-full text-center py-4">No constituencies found</div>
        ) : (
          constituencies.map((constituency) => {
            const inactive = isConstituencyInactive(constituency);
            return (
            <div
              key={constituency._id}
              className={classNames(
                'bg-white overflow-hidden shadow rounded-lg divide-y divide-gray-200',
                inactive ? 'opacity-75 ring-1 ring-gray-300' : ''
              )}
            >
              <div className="px-4 py-5 sm:px-6">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-medium text-gray-900">{constituency.halkaName}</h3>
                      {inactive && (
                        <span className="inline-flex items-center rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700">
                          Inactive
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-gray-500">Last updated: {new Date(constituency.lastUpdated).toLocaleDateString()}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {!inactive && (
                      <>
                        <button
                          onClick={() => openUploadsTable(`Upload URLs — ${constituency.halkaName}`, { halkaName: constituency.halkaName })}
                          className="rounded-md p-2 text-indigo-600 hover:bg-indigo-50"
                          title="View all upload URLs"
                        >
                          <TableCellsIcon className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => openImageViewer({ halkaName: constituency.halkaName })}
                          className="rounded-md p-2 text-indigo-600 hover:bg-indigo-50"
                          title="View uploaded images"
                        >
                          <PhotoIcon className="h-5 w-5" />
                        </button>
                      </>
                    )}
                    {canSeeProcessButtons(user?.email) && (
                      <Menu as="div" className="relative">
                        <Menu.Button className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700">
                          <span className="sr-only">Open menu</span>
                          <EllipsisVerticalIcon className="h-5 w-5" />
                        </Menu.Button>
                        <Transition
                          as={Fragment}
                          enter="transition ease-out duration-100"
                          enterFrom="transform opacity-0 scale-95"
                          enterTo="transform opacity-100 scale-100"
                          leave="transition ease-in duration-75"
                          leaveFrom="transform opacity-100 scale-100"
                          leaveTo="transform opacity-0 scale-95"
                        >
                          <Menu.Items className="absolute right-0 z-10 mt-1 w-44 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                            {inactive ? (
                              <Menu.Item>
                                {({ active }) => (
                                  <button
                                    onClick={() => setConfirmAction({ type: 'activate', constituency })}
                                    className={classNames(
                                      active ? 'bg-gray-100' : '',
                                      'block w-full px-4 py-2 text-left text-sm text-gray-700'
                                    )}
                                  >
                                    Set Active
                                  </button>
                                )}
                              </Menu.Item>
                            ) : (
                              <Menu.Item>
                                {({ active }) => (
                                  <button
                                    onClick={() => setConfirmAction({ type: 'inactive', constituency })}
                                    className={classNames(
                                      active ? 'bg-gray-100' : '',
                                      'block w-full px-4 py-2 text-left text-sm text-gray-700'
                                    )}
                                  >
                                    Set Inactive
                                  </button>
                                )}
                              </Menu.Item>
                            )}
                            <Menu.Item>
                              {({ active }) => (
                                <button
                                  onClick={() => setConfirmAction({ type: 'delete', constituency })}
                                  className={classNames(
                                    active ? 'bg-red-50' : '',
                                    'block w-full px-4 py-2 text-left text-sm text-red-600'
                                  )}
                                >
                                  Delete
                                </button>
                              )}
                            </Menu.Item>
                          </Menu.Items>
                        </Transition>
                      </Menu>
                    )}
                  </div>
                </div>
              </div>
              <div className="px-4 py-5 sm:p-6">
                <dl className="grid grid-cols-2 gap-4">
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Muslim Male</dt>
                    <dd className="mt-1 text-sm text-gray-900">{constituency.muslimMale.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Muslim Female</dt>
                    <dd className="mt-1 text-sm text-gray-900">{constituency.muslimFemale.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Qadiani Male</dt>
                    <dd className="mt-1 text-sm text-gray-900">{constituency.qadianiMale.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Qadiani Female</dt>
                    <dd className="mt-1 text-sm text-gray-900">{constituency.qadianiFemale.toLocaleString()}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-sm font-medium text-gray-500">Total Voters</dt>
                    <dd className="mt-1 text-sm text-gray-900">{constituency.totalVoters.toLocaleString()}</dd>
                  </div>
                </dl>
                <div className="mt-4 space-y-2">
                  {inactive && (
                    <p className="text-sm text-gray-500 text-center py-1">
                      This constituency is inactive. Functionality is disabled.
                    </p>
                  )}
                  <button
                    onClick={() => setSelectedConstituency(selectedConstituency?._id === constituency._id ? null : constituency)}
                    disabled={inactive}
                    className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {selectedConstituency?._id === constituency._id ? 'Hide Block Codes' : 'View Block Codes'}
                  </button>
                  {canSeeProcessButtons(user?.email) && !inactive && (
                    <>
                      <button
                        onClick={() => estimateConstituency(constituency)}
                        disabled={estimationProgress[constituency._id]?.isEstimating}
                        className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {estimationProgress[constituency._id]?.isEstimating ? 'Estimating...' : 'Estimate Constituency'}
                      </button>
                      {constituency.estimates && constituency.estimates.length > 0 && (
                        <button
                          onClick={() => setShowEstimates(prev => ({ ...prev, [constituency._id]: !prev[constituency._id] }))}
                          className="w-full inline-flex justify-center items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                        >
                          {showEstimates[constituency._id] ? 'Hide Estimates' : 'View Estimates'}
                        </button>
                      )}
                    </>
                  )}
                  {estimationProgress[constituency._id]?.isEstimating && (
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                      <div
                        className="bg-green-600 h-2.5 rounded-full transition-all duration-300"
                        style={{
                          width: `${(estimationProgress[constituency._id].current / estimationProgress[constituency._id].total) * 100}%`
                        }}
                      ></div>
                    </div>
                  )}
                  {showEstimates[constituency._id] && constituency.estimates && (
                    <div className="mt-4 space-y-4">
                      <h4 className="text-sm font-medium text-gray-900">Estimate History</h4>
                      <div className="space-y-2">
                        {constituency.estimates.map((estimate, index) => (
                          <div key={estimate._id} className="bg-gray-50 p-3 rounded-md">
                            <div className="flex justify-between items-start">
                              <p className="text-xs text-gray-500">
                                {new Date(estimate.estimatedAt).toLocaleString()}
                              </p>
                              <button
                                onClick={() => updateFromEstimate(constituency._id, estimate._id)}
                                disabled={isUpdatingCount[estimate._id]}
                                className="inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {isUpdatingCount[estimate._id] ? 'Updating...' : 'Update Count'}
                              </button>
                            </div>
                            <dl className="mt-1 grid grid-cols-2 gap-2">
                              <div>
                                <dt className="text-xs font-medium text-gray-500">Muslim Male</dt>
                                <dd className="text-xs text-gray-900">{estimate.muslimMale.toLocaleString()}</dd>
                              </div>
                              <div>
                                <dt className="text-xs font-medium text-gray-500">Muslim Female</dt>
                                <dd className="text-xs text-gray-900">{estimate.muslimFemale.toLocaleString()}</dd>
                              </div>
                              <div>
                                <dt className="text-xs font-medium text-gray-500">Qadiani Male</dt>
                                <dd className="text-xs text-gray-900">{estimate.qadianiMale.toLocaleString()}</dd>
                              </div>
                              <div>
                                <dt className="text-xs font-medium text-gray-500">Qadiani Female</dt>
                                <dd className="text-xs text-gray-900">{estimate.qadianiFemale.toLocaleString()}</dd>
                              </div>
                              <div className="col-span-2">
                                <dt className="text-xs font-medium text-gray-500">Total Voters</dt>
                                <dd className="text-xs text-gray-900">{estimate.totalVoters.toLocaleString()}</dd>
                              </div>
                            </dl>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            );
          })
        )}
      </div>

      {/* Block Codes Table */}
      {selectedConstituency && !isConstituencyInactive(selectedConstituency) && (
        <div className="mt-8">
          <div className="sm:flex sm:items-center mb-4">
            <div className="sm:flex-auto">
              <h2 className="text-xl font-semibold text-gray-900">
                Block Codes for {selectedConstituency.halkaName} ({selectedConstituency.blockCodes.length} total)
              </h2>
            </div>
            <div className="mt-3 flex gap-2 sm:mt-0">
              <button
                onClick={() => openUploadsTable(`All Upload URLs — ${selectedConstituency.halkaName}`, { halkaName: selectedConstituency.halkaName })}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                title="View all upload URLs"
              >
                <TableCellsIcon className="h-4 w-4" />
                All URLs
              </button>
              <button
                onClick={() => openImageViewer({ halkaName: selectedConstituency.halkaName })}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                title="View uploaded images"
              >
                <PhotoIcon className="h-4 w-4" />
                View Images
              </button>
            </div>
          </div>
          <div className="mt-4 flow-root">
            <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
              <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
                <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
                  <table className="min-w-full divide-y divide-gray-300">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">
                          Block Code
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                          Total Files
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                          Estimated Voters
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                          Religion Range
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                          Gender Range
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {selectedConstituency.blockCodes.map((code, index) => (
                        <tr key={index}>
                          <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                            {code}
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                            {blockCodeStats[code]?.totalFiles || '-'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                            {blockCodeStats[code]?.estimatedVoters.toLocaleString() || '-'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                            {blockCodeStats[code] ? 
                              `${blockCodeStats[code].estimatedReligion.min.toLocaleString()} - ${blockCodeStats[code].estimatedReligion.max.toLocaleString()}` 
                              : '-'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                            {blockCodeStats[code] ? 
                              `${blockCodeStats[code].estimatedGender.min.toLocaleString()} - ${blockCodeStats[code].estimatedGender.max.toLocaleString()}` 
                              : '-'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => openUploadsTable(`Upload URLs — Block ${code}`, { blockCode: code })}
                                className="rounded-md p-1.5 text-indigo-600 hover:bg-indigo-50"
                                title="View upload URLs"
                              >
                                <TableCellsIcon className="h-5 w-5" />
                              </button>
                              <button
                                onClick={() => openImageViewer({ blockCode: code })}
                                className="rounded-md p-1.5 text-indigo-600 hover:bg-indigo-50"
                                title="View uploaded images"
                              >
                                <PhotoIcon className="h-5 w-5" />
                              </button>
                              {canSeeProcessButtons(user?.email) && (
                                <>
                                  <button
                                    onClick={() => estimateBlockCodeStats(code)}
                                    disabled={isEstimating[code]}
                                    className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {isEstimating[code] ? 'Estimating...' : 'Estimate'}
                                  </button>
                                  <button
                                    onClick={() => processVoterStats(code)}
                                    className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                                  >
                                    Process Voter
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <UploadUrlsTableModal
        isOpen={showUploadsTable}
        onClose={() => {
          setShowUploadsTable(false);
          setUploadsQueryParams(null);
        }}
        title={uploadsTableTitle}
        queryParams={uploadsQueryParams}
        onViewImage={handleViewImageFromTable}
      />

      <ImageViewerModal
        images={viewerUploads}
        currentIndex={imageViewerIndex}
        isOpen={showImageViewer}
        onClose={() => setShowImageViewer(false)}
        onIndexChange={setImageViewerIndex}
      />

      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-500/75 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-medium text-gray-900">
              {confirmAction.type === 'delete' && 'Delete constituency?'}
              {confirmAction.type === 'inactive' && 'Set constituency inactive?'}
              {confirmAction.type === 'activate' && 'Reactivate constituency?'}
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              {confirmAction.type === 'delete' &&
                `Are you sure you want to delete ${confirmAction.constituency.halkaName}? It will be removed from the constituencies list.`}
              {confirmAction.type === 'inactive' &&
                `Are you sure you want to set ${confirmAction.constituency.halkaName} as inactive? It will no longer be searchable and all functionality will be blocked.`}
              {confirmAction.type === 'activate' &&
                `Reactivate ${confirmAction.constituency.halkaName}? Search and all functionality will be restored.`}
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                disabled={isActionLoading}
                className="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAction}
                disabled={isActionLoading}
                className={classNames(
                  'flex-1 rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50',
                  confirmAction.type === 'delete'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-indigo-600 hover:bg-indigo-700'
                )}
              >
                {isActionLoading
                  ? 'Processing...'
                  : confirmAction.type === 'delete'
                    ? 'Delete'
                    : confirmAction.type === 'inactive'
                      ? 'Set Inactive'
                      : 'Set Active'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Voter Stats Popup */}
      {showVoterStats && voterStats && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                Voter Statistics for Block Code: {selectedBlockCode}
              </h3>
              <button
                onClick={() => setShowVoterStats(false)}
                className="text-gray-400 hover:text-gray-500"
              >
                <span className="sr-only">Close</span>
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <dl className="grid grid-cols-1 gap-4">
              <div>
                <dt className="text-sm font-medium text-gray-500">Total Files</dt>
                <dd className="mt-1 text-sm text-gray-900">{voterStats.totalFiles.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Total Muslim Voters</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {voterStats.totalMuslimVoters.min.toLocaleString()} to {voterStats.totalMuslimVoters.max.toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Total Male</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {voterStats.totalMale.min.toLocaleString()} to {voterStats.totalMale.max.toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Total Female</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {voterStats.totalFemale.min.toLocaleString()} to {voterStats.totalFemale.max.toLocaleString()}
                </dd>
              </div>
            </dl>
            <div className="mt-6 space-y-3">
              <p className="text-sm text-gray-600">
                Runs OCR only when missing, then creates or enriches voters from saved OCR data.
                Already-processed pages are included.
              </p>
              {processingProgress.isProcessing && (
                <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
                  <div
                    className="bg-green-600 h-2.5 rounded-full transition-all duration-300"
                    style={{
                      width: `${processingProgress.total > 0 ? (processingProgress.current / processingProgress.total) * 100 : 0}%`
                    }}
                  ></div>
                  <p className="text-sm text-gray-600 mt-1 text-center">
                    Page {processingProgress.current} of {processingProgress.total}
                  </p>
                  <p className="text-xs text-gray-500 mt-1 text-center">
                    {processingProgress.created} created, {processingProgress.enriched} enriched,{' '}
                    {processingProgress.ocrRun} OCR run, {processingProgress.errors} errors
                  </p>
                </div>
              )}
              <button
                onClick={initiateProcess}
                disabled={isProcessing}
                className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? 'Processing...' : 'Initiate Process'}
              </button>
              <button
                onClick={() => setShowVoterStats(false)}
                className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 