'use client';

import { Fragment, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Menu, Transition } from '@headlessui/react';
import {
  TableCellsIcon,
  EllipsisVerticalIcon,
  RectangleStackIcon,
  UserGroupIcon,
  ClipboardDocumentListIcon,
  ArrowUpTrayIcon,
  Squares2X2Icon,
  ArrowRightIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { blockCodeHubPath } from '@/lib/blockcode-hub';
import { canSeeProcessButtons } from '@/lib/utils';
import ImageViewerModal, { type UploadImage } from '@/components/constituency/ImageViewerModal';
import UploadUrlsTableModal, { type UploadQueryParams } from '@/components/constituency/UploadUrlsTableModal';
import VoterBrowserModal from '@/components/constituency/VoterBrowserModal';
import VotersTableModal from '@/components/constituency/VotersTableModal';
import TableColumnSettingsModal from '@/components/constituency/TableColumnSettingsModal';
import ConstituencyHome from '@/components/constituency/ConstituencyHome';
import type { VoterBrowseQueryParams, VoterBrowseRecord } from '@/lib/voter-browse-types';
import { fetchJson } from '@/lib/fetch-json';
import {
  CONSTITUENCY_INDEX_PATH,
  constituencyHomePath,
  normalizeConstituencySlug,
} from '@/lib/constituency-path';

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

type BlockCodeVoterStatsState =
  | {
      count: number;
      male: number;
      female: number;
    }
  | 'loading'
  | 'error';

type ConstituencyVoterStatsState = BlockCodeVoterStatsState;

const REAL_VOTER_COUNTS_KEY = 'constituency-show-real-voter-counts';

const CARD_THEMES = [
  { gradient: 'from-indigo-500 to-violet-600', bar: 'from-indigo-500 to-violet-500' },
  { gradient: 'from-emerald-500 to-teal-600', bar: 'from-emerald-500 to-teal-500' },
  { gradient: 'from-sky-500 to-cyan-600', bar: 'from-sky-500 to-cyan-500' },
  { gradient: 'from-amber-500 to-orange-600', bar: 'from-amber-500 to-orange-500' },
  { gradient: 'from-rose-500 to-pink-600', bar: 'from-rose-500 to-pink-500' },
  { gradient: 'from-fuchsia-500 to-purple-600', bar: 'from-fuchsia-500 to-purple-500' },
] as const;

interface VoterStats {
  totalPages: number;
  totalFiles: number;
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
  unchanged: number;
  errors: number;
  ocrRun: number;
  currentFileName: string;
  lastError: string;
}

interface QuickUploadForm {
  blockCode: string;
  halkaName: string;
  file: File | null;
  tag: string;
  gender: 'male' | 'female';
  religion: 'muslim' | 'qadiani';
  uploadedPage: UploadImage | null;
}

interface ConstituencyPageContentProps {
  initialHalkaName?: string;
}

export default function ConstituencyPageContent({ initialHalkaName }: ConstituencyPageContentProps) {
  const router = useRouter();
  const normalizedHalkaName = initialHalkaName ? normalizeConstituencySlug(initialHalkaName) : null;
  const isDetailView = Boolean(normalizedHalkaName);
  const [user, setUser] = useState<any>(null);
  const [constituencies, setConstituencies] = useState<Constituency[]>([]);
  const [blockCodeStats, setBlockCodeStats] = useState<Record<string, BlockCodeStats>>({});
  const [blockCodeVoterStats, setBlockCodeVoterStats] = useState<Record<string, BlockCodeVoterStatsState>>({});
  const [constituencyVoterStats, setConstituencyVoterStats] = useState<
    Record<string, ConstituencyVoterStatsState>
  >({});
  const [constituencyStatsProgress, setConstituencyStatsProgress] = useState({ done: 0, total: 0 });
  const [useRealVoterCounts, setUseRealVoterCounts] = useState(true);
  const [voterCountProgress, setVoterCountProgress] = useState({ done: 0, total: 0 });
  const [blockCodeSearch, setBlockCodeSearch] = useState('');
  const loadingBlockStatsRef = useRef<Set<string>>(new Set());
  const loadingConstituencyStatsRef = useRef<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isEstimating, setIsEstimating] = useState<Record<string, boolean>>({});
  const [estimationProgress, setEstimationProgress] = useState<Record<string, EstimationProgress>>({});
  const [showEstimates, setShowEstimates] = useState<Record<string, boolean>>({});
  const [isUpdatingCount, setIsUpdatingCount] = useState<Record<string, boolean>>({});
  const [showVoterStats, setShowVoterStats] = useState<boolean>(false);
  const [selectedBlockCode, setSelectedBlockCode] = useState<string>('');
  const [voterStats, setVoterStats] = useState<VoterStats | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [findMissingVoter, setFindMissingVoter] = useState(true);
  const [processingProgress, setProcessingProgress] = useState<ProcessingProgress>({
    current: 0,
    total: 0,
    isProcessing: false,
    created: 0,
    enriched: 0,
    unchanged: 0,
    errors: 0,
    ocrRun: 0,
    currentFileName: '',
    lastError: '',
  });
  const [showUploadsTable, setShowUploadsTable] = useState(false);
  const [uploadsTableTitle, setUploadsTableTitle] = useState('');
  const [uploadsQueryParams, setUploadsQueryParams] = useState<UploadQueryParams | null>(null);
  const [showImageViewer, setShowImageViewer] = useState(false);
  const [browserQueryParams, setBrowserQueryParams] = useState<UploadQueryParams | null>(null);
  const [browserInitialPage, setBrowserInitialPage] = useState(1);
  const [browserInitialIndex, setBrowserInitialIndex] = useState(0);
  const [showVoterBrowser, setShowVoterBrowser] = useState(false);
  const [voterBrowserQueryParams, setVoterBrowserQueryParams] = useState<VoterBrowseQueryParams | null>(null);
  const [voterBrowserInitialPage, setVoterBrowserInitialPage] = useState(1);
  const [voterBrowserInitialIndex, setVoterBrowserInitialIndex] = useState(0);
  const [showVotersTable, setShowVotersTable] = useState(false);
  const [votersTableTitle, setVotersTableTitle] = useState('');
  const [votersTableQueryParams, setVotersTableQueryParams] = useState<VoterBrowseQueryParams | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [columnSettingsConstituency, setColumnSettingsConstituency] = useState<Constituency | null>(null);
  const activeConstituency = useMemo(() => {
    if (!normalizedHalkaName) {
      return null;
    }
    return constituencies.find((constituency) => constituency.halkaName === normalizedHalkaName) ?? null;
  }, [constituencies, normalizedHalkaName]);

  const [quickUpload, setQuickUpload] = useState<QuickUploadForm | null>(null);
  const [isQuickUploading, setIsQuickUploading] = useState(false);

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
    const stored = localStorage.getItem(REAL_VOTER_COUNTS_KEY);
    if (stored === 'false') {
      setUseRealVoterCounts(false);
    }
  }, []);

  useEffect(() => {
    fetchConstituencies();
  }, []);

  const toggleVoterCountMode = () => {
    setUseRealVoterCounts((prev) => {
      const next = !prev;
      localStorage.setItem(REAL_VOTER_COUNTS_KEY, String(next));
      return next;
    });
  };

  const fetchConstituencyVoterStats = useCallback(
    async (halkaName: string, signal?: AbortSignal, forceRefresh = false): Promise<boolean> => {
      if (loadingConstituencyStatsRef.current.has(halkaName)) {
        return false;
      }

      loadingConstituencyStatsRef.current.add(halkaName);
      setConstituencyVoterStats((prev) => {
        const current = prev[halkaName];
        if (!forceRefresh && current && current !== 'error' && typeof current === 'object') {
          return prev;
        }
        return { ...prev, [halkaName]: 'loading' };
      });

      try {
        const params = new URLSearchParams({ halkaName });
        const response = await fetch(`/api/voters/count?${params.toString()}`, { signal });

        if (!response.ok) {
          throw new Error('Failed to load constituency voter stats');
        }

        const data: { count: number; male: number; female: number } = await response.json();
        if (signal?.aborted) {
          return false;
        }

        setConstituencyVoterStats((prev) => ({
          ...prev,
          [halkaName]: {
            count: data.count,
            male: data.male,
            female: data.female,
          },
        }));
        return true;
      } catch (error) {
        if (signal?.aborted) {
          return false;
        }
        setConstituencyVoterStats((prev) => ({ ...prev, [halkaName]: 'error' }));
        return false;
      } finally {
        loadingConstituencyStatsRef.current.delete(halkaName);
      }
    },
    []
  );

  useEffect(() => {
    if (!constituencies.length) {
      return;
    }

    const abortController = new AbortController();
    const activeConstituencies = constituencies.filter((c) => c.status !== 'inactive');

    setConstituencyVoterStats({});
    setConstituencyStatsProgress({ done: 0, total: activeConstituencies.length });
    loadingConstituencyStatsRef.current.clear();

    const loadConstituencyStatsSequentially = async () => {
      for (let index = 0; index < activeConstituencies.length; index += 1) {
        if (abortController.signal.aborted) {
          return;
        }

        const { halkaName } = activeConstituencies[index];
        await fetchConstituencyVoterStats(halkaName, abortController.signal);

        if (!abortController.signal.aborted) {
          setConstituencyStatsProgress((prev) => ({ ...prev, done: index + 1 }));
        }
      }
    };

    void loadConstituencyStatsSequentially();

    return () => {
      abortController.abort();
    };
  }, [constituencies, fetchConstituencyVoterStats]);

  const fetchBlockVoterStats = useCallback(
    async (
      blockCode: string,
      halkaName: string,
      signal?: AbortSignal,
      forceRefresh = false
    ): Promise<boolean> => {
      const key = `${halkaName}:${blockCode}`;
      if (loadingBlockStatsRef.current.has(key)) {
        return false;
      }

      loadingBlockStatsRef.current.add(key);
      setBlockCodeVoterStats((prev) => {
        const current = prev[blockCode];
        if (!forceRefresh && current && current !== 'error' && typeof current === 'object') {
          return prev;
        }
        return { ...prev, [blockCode]: 'loading' };
      });

      try {
        const params = new URLSearchParams({ blockCode, halkaName });
        const response = await fetch(`/api/voters/count?${params.toString()}`, { signal });

        if (!response.ok) {
          throw new Error('Failed to load voter stats');
        }

        const data: { count: number; male: number; female: number } = await response.json();
        if (signal?.aborted) {
          return false;
        }

        setBlockCodeVoterStats((prev) => ({
          ...prev,
          [blockCode]: {
            count: data.count,
            male: data.male,
            female: data.female,
          },
        }));
        return true;
      } catch (error) {
        if (signal?.aborted) {
          return false;
        }
        setBlockCodeVoterStats((prev) => ({ ...prev, [blockCode]: 'error' }));
        return false;
      } finally {
        loadingBlockStatsRef.current.delete(key);
      }
    },
    []
  );

  useEffect(() => {
    if (!activeConstituency || activeConstituency.status === 'inactive') {
      setBlockCodeVoterStats({});
      setVoterCountProgress({ done: 0, total: 0 });
      setBlockCodeSearch('');
      loadingBlockStatsRef.current.clear();
      return;
    }

    const abortController = new AbortController();
    const { halkaName, blockCodes } = activeConstituency;

    setBlockCodeVoterStats({});
    setVoterCountProgress({ done: 0, total: blockCodes.length });
    loadingBlockStatsRef.current.clear();

    const loadVoterStatsSequentially = async () => {
      for (let index = 0; index < blockCodes.length; index += 1) {
        if (abortController.signal.aborted) {
          return;
        }

        const blockCode = blockCodes[index];
        await fetchBlockVoterStats(blockCode, halkaName, abortController.signal);

        if (!abortController.signal.aborted) {
          setVoterCountProgress((prev) => ({ ...prev, done: index + 1 }));
        }
      }
    };

    void loadVoterStatsSequentially();

    return () => {
      abortController.abort();
    };
  }, [activeConstituency?._id, fetchBlockVoterStats]);

  const filteredBlockCodes = useMemo(() => {
    if (!activeConstituency) {
      return [];
    }

    const query = blockCodeSearch.trim();
    if (!query) {
      return activeConstituency.blockCodes;
    }

    return activeConstituency.blockCodes.filter((code) => code.includes(query));
  }, [activeConstituency, blockCodeSearch]);

  const searchMatchBlockCode = useMemo(() => {
    if (!activeConstituency || !blockCodeSearch.trim()) {
      return null;
    }

    const query = blockCodeSearch.trim();
    if (activeConstituency.blockCodes.includes(query)) {
      return query;
    }

    if (filteredBlockCodes.length === 1) {
      return filteredBlockCodes[0];
    }

    return null;
  }, [activeConstituency, blockCodeSearch, filteredBlockCodes]);

  useEffect(() => {
    if (!activeConstituency || !searchMatchBlockCode) {
      return;
    }

    const abortController = new AbortController();
    const { halkaName } = activeConstituency;
    void fetchBlockVoterStats(searchMatchBlockCode, halkaName, abortController.signal, true);
    void fetchConstituencyVoterStats(halkaName, abortController.signal, true);

    const row = document.getElementById(`block-code-row-${searchMatchBlockCode}`);
    row?.scrollIntoView({ behavior: 'smooth', block: 'center' });

    return () => {
      abortController.abort();
    };
  }, [searchMatchBlockCode, activeConstituency, fetchBlockVoterStats, fetchConstituencyVoterStats]);

  const renderStatValue = (value: number | undefined, loading = false) => {
    if (loading) {
      return <span className="inline-block h-4 w-10 animate-pulse rounded bg-gray-200" aria-label="Loading" />;
    }
    if (value == null) {
      return <span className="text-gray-400">—</span>;
    }
    return <span className="font-medium text-gray-900">{value.toLocaleString()}</span>;
  };

  const renderConstituencyVoterStats = (
    halkaName: string,
    field: 'count' | 'male' | 'female'
  ) => {
    const stats = constituencyVoterStats[halkaName];
    if (stats === 'loading') {
      return renderStatValue(undefined, true);
    }
    if (stats === 'error') {
      return <span className="text-gray-400">—</span>;
    }
    if (stats && typeof stats === 'object') {
      return renderStatValue(stats[field]);
    }
    return <span className="text-gray-400">—</span>;
  };

  const renderBlockVoterStats = (blockCode: string, field: 'count' | 'male' | 'female') => {
    const stats = blockCodeVoterStats[blockCode];
    if (stats === 'loading') {
      return renderStatValue(undefined, true);
    }
    if (stats === 'error') {
      return <span className="text-gray-400">—</span>;
    }
    if (stats && typeof stats === 'object') {
      return renderStatValue(stats[field]);
    }
    return <span className="text-gray-400">—</span>;
  };

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

  const openBrowser = (
    params: UploadQueryParams,
    startPage = 1,
    startIndex = 0
  ) => {
    setBrowserQueryParams(params);
    setBrowserInitialPage(startPage);
    setBrowserInitialIndex(startIndex);
    setShowImageViewer(true);
    setShowUploadsTable(false);
  };

  const openUploadsTable = (title: string, params: UploadQueryParams) => {
    setUploadsTableTitle(title);
    setUploadsQueryParams(params);
    setShowUploadsTable(true);
  };

  const openVoterBrowser = (
    params: VoterBrowseQueryParams,
    startPage = 1,
    startIndex = 0
  ) => {
    setVoterBrowserQueryParams(params);
    setVoterBrowserInitialPage(startPage);
    setVoterBrowserInitialIndex(startIndex);
    setShowVoterBrowser(true);
    setShowVotersTable(false);
  };

  const openVotersTable = (title: string, params: VoterBrowseQueryParams) => {
    setVotersTableTitle(title);
    setVotersTableQueryParams(params);
    setShowVotersTable(true);
  };

  const handleBrowseVoterFromTable = (
    _voter: VoterBrowseRecord,
    page: number,
    indexInPage: number
  ) => {
    if (!votersTableQueryParams) return;
    openVoterBrowser(votersTableQueryParams, page, indexInPage);
  };

  const handleViewImageFromTable = (
    _upload: UploadImage,
    _pageUploads: UploadImage[],
    indexInPage: number,
    page: number
  ) => {
    if (!uploadsQueryParams) return;
    openBrowser(uploadsQueryParams, page, indexInPage);
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
        if (activeConstituency?._id === confirmAction.constituency._id && isDetailView) {
          router.push(CONSTITUENCY_INDEX_PATH);
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
      const response = await fetch(`/api/blockcodes/?blockCode=${blockCode}&lite=true`);
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
        const response = await fetch(`/api/blockcodes/?blockCode=${blockCode}&lite=true`);
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

  const runVoterProcessForPages = async (
    blockCode: string,
    pages: BlockCode[],
    totalFiles: number,
    halkaName?: string,
    options?: { forceOcr?: boolean }
  ) => {
    const forceOcr = options?.forceOcr === true;
    setVoterStats({
      totalPages: pages.length,
      totalFiles,
    });

    if (!pages.length) {
      toast.error('No voter pages found for this block code.');
      setProcessingProgress((prev) => ({
        ...prev,
        isProcessing: false,
        currentFileName: '',
        lastError: 'No voter pages found for this block code.',
      }));
      return;
    }

    setProcessingProgress((prev) => ({
      ...prev,
      total: pages.length,
      currentFileName: pages[0].fileName,
    }));

    let created = 0;
    let enriched = 0;
    let unchanged = 0;
    let errors = 0;
    let pageFailures = 0;
    let ocrRun = 0;
    let lastError = '';

    for (let i = 0; i < pages.length; i += 1) {
      const doc = pages[i];

      setProcessingProgress((prev) => ({
        ...prev,
        current: i,
        currentFileName: doc.fileName,
        lastError: '',
      }));

      try {
        const { response: processResponse, data } = await fetchJson<{
          details?: string;
          error?: string;
          enrich?: {
            created?: number;
            enriched?: number;
            unchanged?: number;
            errors?: number;
          };
          ocr_skipped?: boolean;
        }>(
          `/api/blockcodes/process-enrich/?page_id=${encodeURIComponent(doc._id)}${forceOcr ? '&force=true' : ''}`
        );

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
        pageFailures += 1;
        lastError = docError instanceof Error ? docError.message : 'Processing failed';
      }

      setProcessingProgress({
        current: i + 1,
        total: pages.length,
        isProcessing: true,
        created,
        enriched,
        unchanged,
        errors: errors + pageFailures,
        ocrRun,
        currentFileName: doc.fileName,
        lastError,
      });
    }

    const statsHalkaName = halkaName ?? activeConstituency?.halkaName ?? pages[0]?.halkaName;
    if (statsHalkaName) {
      await fetchBlockVoterStats(blockCode, statsHalkaName, undefined, true);
      await fetchConstituencyVoterStats(statsHalkaName, undefined, true);
    }

    if (pageFailures === pages.length) {
      toast.error(lastError || 'Processing failed for all pages');
    } else {
      toast.success(
        `Processing complete — ${created} created, ${enriched} enriched, ${unchanged} unchanged, ${ocrRun} OCR run, ${errors} enrich errors${pageFailures ? `, ${pageFailures} page failures` : ''}`
      );
    }
  };

  const runBlockVoterProcess = async (blockCode: string, forceOcr?: boolean) => {
    const shouldForceOcr = forceOcr ?? findMissingVoter;
    try {
      setIsProcessing(true);
      setProcessingProgress({
        current: 0,
        total: 0,
        isProcessing: true,
        created: 0,
        enriched: 0,
        unchanged: 0,
        errors: 0,
        ocrRun: 0,
        currentFileName: 'Loading pages…',
        lastError: '',
      });

      const { response, data } = await fetchJson<BlockCode[] | { error?: string }>(
        `/api/blockcodes/?blockCode=${encodeURIComponent(blockCode)}&lite=true`
      );

      if (!response.ok) {
        const message =
          !Array.isArray(data) && data.error ? data.error : 'Failed to load block code pages';
        throw new Error(message);
      }

      if (!Array.isArray(data)) {
        throw new Error('Unexpected response when loading block code pages');
      }

      const pages = data;
      await runVoterProcessForPages(blockCode, pages, pages.length, undefined, {
        forceOcr: shouldForceOcr,
      });
    } catch (error) {
      console.error('Failed to process voters:', error);
      const message = error instanceof Error ? error.message : 'Processing failed';
      toast.error(message);
      setVoterStats({ totalPages: 0, totalFiles: 0 });
      setProcessingProgress((prev) => ({
        ...prev,
        isProcessing: false,
        currentFileName: '',
        lastError: message,
      }));
    } finally {
      setIsProcessing(false);
      setProcessingProgress((prev) => ({
        ...prev,
        isProcessing: false,
      }));
    }
  };

  const processVoterStats = (blockCode: string) => {
    setSelectedBlockCode(blockCode);
    setVoterStats(null);
    setFindMissingVoter(true);
    setShowVoterStats(true);
    setIsProcessing(true);
    setProcessingProgress({
      current: 0,
      total: 0,
      isProcessing: true,
      created: 0,
      enriched: 0,
      unchanged: 0,
      errors: 0,
      ocrRun: 0,
      currentFileName: 'Starting…',
      lastError: '',
    });
    void runBlockVoterProcess(blockCode, true);
  };

  const openQuickUpload = (blockCode: string) => {
    if (!activeConstituency) {
      toast.error('Select a constituency first.');
      return;
    }

    setQuickUpload({
      blockCode,
      halkaName: activeConstituency.halkaName,
      file: null,
      tag: 'page',
      gender: 'male',
      religion: 'muslim',
      uploadedPage: null,
    });
  };

  const handleQuickUpload = async () => {
    if (!quickUpload?.file) {
      toast.error('Select a page image first.');
      return;
    }

    setIsQuickUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', quickUpload.file);
      formData.append('blockCode', quickUpload.blockCode);
      formData.append('halkaName', quickUpload.halkaName);
      formData.append('tag', quickUpload.tag);
      formData.append('gender', quickUpload.gender);
      formData.append('religion', quickUpload.religion);

      const response = await fetch('/api/blockcodes/upload-page', {
        method: 'POST',
        body: formData,
      });
      const data: { upload?: UploadImage; error?: string } = await response.json();

      if (!response.ok || !data.upload) {
        throw new Error(data.error || 'Upload failed');
      }

      setQuickUpload((prev) => (prev ? { ...prev, uploadedPage: data.upload!, file: null } : prev));
      setBlockCodeStats((prev) => {
        const current = prev[quickUpload.blockCode];
        if (!current) return prev;
        return {
          ...prev,
          [quickUpload.blockCode]: {
            ...current,
            totalFiles: current.totalFiles + 1,
            estimatedVoters: current.estimatedVoters + 28,
          },
        };
      });
      toast.success('Page uploaded');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setIsQuickUploading(false);
    }
  };

  const processUploadedPage = (page: UploadImage) => {
    setQuickUpload(null);
    setSelectedBlockCode(page.blockCode);
    setVoterStats(null);
    setFindMissingVoter(true);
    setShowVoterStats(true);
    setIsProcessing(true);
    setProcessingProgress({
      current: 0,
      total: 1,
      isProcessing: true,
      created: 0,
      enriched: 0,
      unchanged: 0,
      errors: 0,
      ocrRun: 0,
      currentFileName: page.fileName,
      lastError: '',
    });
    void (async () => {
      try {
        await runVoterProcessForPages(page.blockCode, [page], 1, page.halkaName, {
          forceOcr: true,
        });
      } finally {
        setIsProcessing(false);
        setProcessingProgress((prev) => ({ ...prev, isProcessing: false }));
      }
    })();
  };

  const detailHome =
    activeConstituency && !isConstituencyInactive(activeConstituency) ? (
      <ConstituencyHome
          halkaName={activeConstituency.halkaName}
          onBack={() => {
            setBlockCodeSearch('');
            router.push(CONSTITUENCY_INDEX_PATH);
          }}
          onOpenVotersTable={() =>
            openVotersTable(`Voters — ${activeConstituency.halkaName}`, {
              halkaName: activeConstituency.halkaName,
            })
          }
          onOpenVoterBrowser={() => openVoterBrowser({ halkaName: activeConstituency.halkaName })}
          onOpenUploadsTable={() =>
            openUploadsTable(`All Upload URLs — ${activeConstituency.halkaName}`, {
              halkaName: activeConstituency.halkaName,
            })
          }
          onOpenPagesBrowser={() => openBrowser({ halkaName: activeConstituency.halkaName })}
          onBlockCodeSearch={setBlockCodeSearch}
          blockCodeSearch={blockCodeSearch}
          onOpenColumnSettings={
            canSeeProcessButtons(user?.email)
              ? () => setColumnSettingsConstituency(activeConstituency)
              : undefined
          }
          canProcess={canSeeProcessButtons(user?.email)}
        >
          {voterCountProgress.total > 0 && voterCountProgress.done < voterCountProgress.total && (
            <p className="mb-3 text-sm text-slate-500">
              Loading voter counts ({voterCountProgress.done}/{voterCountProgress.total})…
            </p>
          )}
          {blockCodeSearch.trim() && (
            <p className="mb-3 text-sm text-slate-500">
              {filteredBlockCodes.length} match{filteredBlockCodes.length === 1 ? '' : 'es'}
              {searchMatchBlockCode ? ` · found ${searchMatchBlockCode}` : ''}
            </p>
          )}
          <div className="flow-root">
            <div className="-mx-4 overflow-x-auto sm:-mx-6 lg:-mx-8">
              <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
                <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
                  <table className="min-w-full divide-y divide-gray-300">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">
                          Block Code
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                          Voter Count
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                          Male
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                          Female
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
                      {filteredBlockCodes.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="px-6 py-8 text-center text-sm text-gray-500">
                            No block codes match &quot;{blockCodeSearch.trim()}&quot;
                          </td>
                        </tr>
                      ) : (
                        filteredBlockCodes.map((code) => (
                        <tr
                          key={code}
                          id={`block-code-row-${code}`}
                          className={searchMatchBlockCode === code ? 'bg-indigo-50' : undefined}
                        >
                          <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                            <div className="flex items-center gap-2">
                              <span>{code}</span>
                              <Link
                                href={blockCodeHubPath(code, activeConstituency.halkaName)}
                                className="rounded-md p-1.5 text-violet-600 hover:bg-violet-50"
                                title="Open block code hub"
                              >
                                <Squares2X2Icon className="h-5 w-5" />
                              </Link>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                            {renderBlockVoterStats(code, 'count')}
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                            {renderBlockVoterStats(code, 'male')}
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                            {renderBlockVoterStats(code, 'female')}
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
                                onClick={() =>
                                  openUploadsTable(`Upload URLs — Block ${code}`, {
                                    blockCode: code,
                                    halkaName: activeConstituency.halkaName,
                                  })
                                }
                                className="rounded-md p-1.5 text-indigo-600 hover:bg-indigo-50"
                                title="View upload URLs"
                              >
                                <TableCellsIcon className="h-5 w-5" />
                              </button>
                              <button
                                onClick={() => openVoterBrowser({ blockCode: code })}
                                className="rounded-md p-1.5 text-emerald-600 hover:bg-emerald-50"
                                title="Browse voters"
                              >
                                <UserGroupIcon className="h-5 w-5" />
                              </button>
                              <button
                                onClick={() => openBrowser({ blockCode: code })}
                                className="rounded-md p-1.5 text-indigo-600 hover:bg-indigo-50"
                                title="Browse uploaded pages"
                              >
                                <RectangleStackIcon className="h-5 w-5" />
                              </button>
                              <button
                                onClick={() => openQuickUpload(code)}
                                className="rounded-md p-1.5 text-blue-600 hover:bg-blue-50"
                                title="Upload page"
                              >
                                <ArrowUpTrayIcon className="h-5 w-5" />
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
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </ConstituencyHome>
    ) : null;

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-6">
      {isDetailView ? (
        isLoading ? (
          <div className="space-y-4">
            <div className="h-40 animate-pulse rounded-3xl bg-gradient-to-br from-indigo-100 to-violet-100" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
              ))}
            </div>
          </div>
        ) : !activeConstituency ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
            <h2 className="text-xl font-bold text-red-900">Constituency not found</h2>
            <p className="mt-2 text-sm text-red-700">
              No constituency matches <span className="font-mono font-semibold">{normalizedHalkaName}</span>.
            </p>
            <button
              onClick={() => router.push(CONSTITUENCY_INDEX_PATH)}
              className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              Back to all constituencies
            </button>
          </div>
        ) : isConstituencyInactive(activeConstituency) ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <h2 className="text-xl font-bold text-slate-900">{activeConstituency.halkaName}</h2>
            <p className="mt-2 text-sm text-slate-600">This constituency is inactive. Functionality is disabled.</p>
            <button
              onClick={() => router.push(CONSTITUENCY_INDEX_PATH)}
              className="mt-4 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Back to all constituencies
            </button>
          </div>
        ) : (
          detailHome
        )
      ) : (
        <>
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-violet-950 p-6 text-white shadow-xl sm:p-8">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2">
            <SparklesIcon className="h-6 w-6 text-amber-300" />
            <span className="text-sm font-semibold uppercase tracking-wider text-indigo-200">Constituencies</span>
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Electoral constituencies</h1>
          <p className="mt-2 max-w-2xl text-indigo-100">
            Browse voter statistics, block codes, uploads, and processing for each halka.
          </p>
          {useRealVoterCounts &&
            constituencyStatsProgress.total > 0 &&
            constituencyStatsProgress.done < constituencyStatsProgress.total && (
              <p className="mt-3 text-sm text-indigo-200">
                Loading real voter counts ({constituencyStatsProgress.done}/{constituencyStatsProgress.total})…
              </p>
            )}
        </div>
      </div>

      {/* Constituency Cards */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          <div className="col-span-full text-center py-4">Loading...</div>
        ) : constituencies.length === 0 ? (
          <div className="col-span-full text-center py-4">No constituencies found</div>
        ) : (
          constituencies.map((constituency, index) => {
            const inactive = isConstituencyInactive(constituency);
            const theme = CARD_THEMES[index % CARD_THEMES.length];
            return (
            <div
              key={constituency._id}
              className={classNames(
                'group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg',
                inactive ? 'opacity-75' : ''
              )}
            >
              <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${theme.gradient}`} />
              <div className="px-5 py-5">
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
                          onClick={() => openVoterBrowser({ halkaName: constituency.halkaName })}
                          className="rounded-md p-2 text-emerald-600 hover:bg-emerald-50"
                          title="Browse voters"
                        >
                          <UserGroupIcon className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => openVotersTable(`Voters — ${constituency.halkaName}`, { halkaName: constituency.halkaName })}
                          className="rounded-md p-2 text-emerald-600 hover:bg-emerald-50"
                          title="Voters list"
                        >
                          <ClipboardDocumentListIcon className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => openBrowser({ halkaName: constituency.halkaName })}
                          className="rounded-md p-2 text-indigo-600 hover:bg-indigo-50"
                          title="Browse uploaded pages"
                        >
                          <RectangleStackIcon className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => openUploadsTable(`Upload URLs — ${constituency.halkaName}`, { halkaName: constituency.halkaName })}
                          className="rounded-md p-2 text-indigo-600 hover:bg-indigo-50"
                          title="View all upload URLs"
                        >
                          <TableCellsIcon className="h-5 w-5" />
                        </button>
                      </>
                    )}
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
                          <Menu.Items className="absolute right-0 z-10 mt-1 w-56 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                            <Menu.Item>
                              {({ active }) => (
                                <button
                                  onClick={toggleVoterCountMode}
                                  className={classNames(
                                    active ? 'bg-gray-100' : '',
                                    'block w-full px-4 py-2 text-left text-sm text-gray-700'
                                  )}
                                >
                                  {useRealVoterCounts ? 'Show estimated counts' : 'Show real voter counts'}
                                </button>
                              )}
                            </Menu.Item>
                            {canSeeProcessButtons(user?.email) && !inactive && (
                              <Menu.Item>
                                {({ active }) => (
                                  <button
                                    onClick={() => setColumnSettingsConstituency(constituency)}
                                    className={classNames(
                                      active ? 'bg-gray-100' : '',
                                      'block w-full px-4 py-2 text-left text-sm text-gray-700'
                                    )}
                                  >
                                    Table columns
                                  </button>
                                )}
                              </Menu.Item>
                            )}
                            {canSeeProcessButtons(user?.email) && (
                              inactive ? (
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
                            ))}
                            {canSeeProcessButtons(user?.email) && (
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
                            )}
                          </Menu.Items>
                        </Transition>
                      </Menu>
                  </div>
                </div>
              </div>
              <div className="border-t border-slate-100 px-5 py-5">
                {useRealVoterCounts ? (
                  <dl className="grid grid-cols-2 gap-4">
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Male</dt>
                      <dd className="mt-1 text-sm text-gray-900">
                        {inactive ? '—' : renderConstituencyVoterStats(constituency.halkaName, 'male')}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Female</dt>
                      <dd className="mt-1 text-sm text-gray-900">
                        {inactive ? '—' : renderConstituencyVoterStats(constituency.halkaName, 'female')}
                      </dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-sm font-medium text-gray-500">Total Voters</dt>
                      <dd className="mt-1 text-sm text-gray-900">
                        {inactive ? '—' : renderConstituencyVoterStats(constituency.halkaName, 'count')}
                      </dd>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs text-emerald-700">From voters collection (distinct CNIC)</p>
                    </div>
                  </dl>
                ) : (
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
                    <div className="col-span-2">
                      <p className="text-xs text-gray-500">Estimated counts stored on constituency</p>
                    </div>
                  </dl>
                )}
                <div className="mt-4 space-y-2">
                  {inactive && (
                    <p className="text-sm text-gray-500 text-center py-1">
                      This constituency is inactive. Functionality is disabled.
                    </p>
                  )}
                  <button
                    onClick={() => router.push(constituencyHomePath(constituency.halkaName))}
                    disabled={inactive}
                    className={`w-full inline-flex justify-center items-center gap-2 px-4 py-2.5 border border-transparent text-sm font-semibold rounded-xl text-white bg-gradient-to-r shadow-sm transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed ${theme.gradient}`}
                  >
                    Open constituency home
                    <ArrowRightIcon className="h-4 w-4" />
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
        </>
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
        onUploaded={() => {
          const blockCode = uploadsQueryParams?.blockCode;
          const halkaName = uploadsQueryParams?.halkaName ?? activeConstituency?.halkaName;
          if (blockCode && halkaName) {
            void fetchBlockVoterStats(blockCode, halkaName, undefined, true);
            void fetchConstituencyVoterStats(halkaName, undefined, true);
          }
        }}
      />

      <VotersTableModal
        isOpen={showVotersTable}
        onClose={() => {
          setShowVotersTable(false);
          setVotersTableQueryParams(null);
        }}
        title={votersTableTitle}
        queryParams={votersTableQueryParams}
        onBrowseVoter={handleBrowseVoterFromTable}
      />

      <VoterBrowserModal
        key={`${voterBrowserQueryParams?.halkaName ?? ''}-${voterBrowserQueryParams?.blockCode ?? ''}-${voterBrowserInitialPage}-${voterBrowserInitialIndex}`}
        isOpen={showVoterBrowser}
        onClose={() => {
          setShowVoterBrowser(false);
          setVoterBrowserQueryParams(null);
        }}
        queryParams={voterBrowserQueryParams}
        initialPage={voterBrowserInitialPage}
        initialIndex={voterBrowserInitialIndex}
      />

      <ImageViewerModal
        key={`${browserQueryParams?.halkaName ?? ''}-${browserQueryParams?.blockCode ?? ''}-${browserInitialPage}-${browserInitialIndex}`}
        isOpen={showImageViewer}
        onClose={() => {
          setShowImageViewer(false);
          setBrowserQueryParams(null);
        }}
        queryParams={browserQueryParams}
        initialPage={browserInitialPage}
        initialIndex={browserInitialIndex}
      />

      {columnSettingsConstituency && (
        <TableColumnSettingsModal
          isOpen={Boolean(columnSettingsConstituency)}
          onClose={() => setColumnSettingsConstituency(null)}
          constituencyId={columnSettingsConstituency._id}
          halkaName={columnSettingsConstituency.halkaName}
          blockCodes={columnSettingsConstituency.blockCodes}
          onSaved={() => setColumnSettingsConstituency(null)}
        />
      )}

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

      {quickUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-500/75 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-medium text-gray-900">
                  Upload Page — Block {quickUpload.blockCode}
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Upload a single page image, then process voters from that uploaded page.
                </p>
              </div>
              <button
                onClick={() => setQuickUpload(null)}
                disabled={isQuickUploading}
                className="text-gray-400 hover:text-gray-500 disabled:opacity-50"
              >
                <span className="sr-only">Close</span>
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label htmlFor="quick-page-file" className="block text-sm font-medium text-gray-700">
                  Page image
                </label>
                <input
                  id="quick-page-file"
                  type="file"
                  accept="image/*"
                  onChange={(event) =>
                    setQuickUpload((prev) =>
                      prev ? { ...prev, file: event.target.files?.[0] ?? null, uploadedPage: null } : prev
                    )
                  }
                  disabled={isQuickUploading}
                  className="mt-1 block w-full text-sm text-gray-700 file:mr-4 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100 disabled:opacity-50"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="quick-page-tag" className="block text-sm font-medium text-gray-700">
                    Tag
                  </label>
                  <select
                    id="quick-page-tag"
                    value={quickUpload.tag}
                    onChange={(event) =>
                      setQuickUpload((prev) => (prev ? { ...prev, tag: event.target.value } : prev))
                    }
                    disabled={isQuickUploading}
                    className="mt-1 block w-full rounded-md border border-gray-300 py-2 pl-3 pr-8 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                  >
                    <option value="page">Page</option>
                    <option value="title">Title</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="quick-page-gender" className="block text-sm font-medium text-gray-700">
                    Gender
                  </label>
                  <select
                    id="quick-page-gender"
                    value={quickUpload.gender}
                    onChange={(event) =>
                      setQuickUpload((prev) =>
                        prev ? { ...prev, gender: event.target.value === 'female' ? 'female' : 'male' } : prev
                      )
                    }
                    disabled={isQuickUploading}
                    className="mt-1 block w-full rounded-md border border-gray-300 py-2 pl-3 pr-8 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="quick-page-religion" className="block text-sm font-medium text-gray-700">
                    Religion
                  </label>
                  <select
                    id="quick-page-religion"
                    value={quickUpload.religion}
                    onChange={(event) =>
                      setQuickUpload((prev) =>
                        prev
                          ? {
                              ...prev,
                              religion: event.target.value === 'qadiani' ? 'qadiani' : 'muslim',
                            }
                          : prev
                      )
                    }
                    disabled={isQuickUploading}
                    className="mt-1 block w-full rounded-md border border-gray-300 py-2 pl-3 pr-8 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                  >
                    <option value="muslim">Muslim</option>
                    <option value="qadiani">Qadiani</option>
                  </select>
                </div>
              </div>

              {quickUpload.uploadedPage && (
                <div className="rounded-md bg-green-50 p-3 text-sm text-green-800">
                  Uploaded {quickUpload.uploadedPage.fileName}
                </div>
              )}

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={handleQuickUpload}
                  disabled={isQuickUploading || !quickUpload.file}
                  className="inline-flex flex-1 items-center justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isQuickUploading ? 'Uploading…' : 'Upload Page'}
                </button>
                <button
                  onClick={() => quickUpload.uploadedPage && processUploadedPage(quickUpload.uploadedPage)}
                  disabled={!quickUpload.uploadedPage || isQuickUploading}
                  className="inline-flex flex-1 items-center justify-center rounded-md border border-transparent bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Process Uploaded Page
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Voter Stats Popup */}
      {showVoterStats && selectedBlockCode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-500/75 p-4">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                Process Voters — Block {selectedBlockCode}
              </h3>
              <button
                onClick={() => {
                  if (!isProcessing) {
                    setShowVoterStats(false);
                  }
                }}
                disabled={isProcessing}
                className="text-gray-400 hover:text-gray-500 disabled:opacity-50"
              >
                <span className="sr-only">Close</span>
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-sm font-medium text-gray-500">Pages to process</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {voterStats ? voterStats.totalPages.toLocaleString() : renderStatValue(undefined, true)}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Total uploads</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {voterStats ? voterStats.totalFiles.toLocaleString() : renderStatValue(undefined, true)}
                </dd>
              </div>
            </dl>
            <div className="mt-6 space-y-3">
              <label className="flex items-start justify-between gap-3 rounded-md border border-gray-200 px-3 py-2.5">
                <div>
                  <span className="text-sm font-medium text-gray-900">Find missing voter</span>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {findMissingVoter
                      ? 'Re-runs OCR on every page, then enriches voter records.'
                      : 'Uses existing OCR data when available; only enriches voter records.'}
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={findMissingVoter}
                  onChange={(event) => setFindMissingVoter(event.target.checked)}
                  disabled={isProcessing}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500 disabled:opacity-50"
                />
              </label>
              <p className="text-sm text-gray-600">
                Processes each page one at a time.
              </p>
              <div className="w-full">
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div
                    className={classNames(
                      'h-2.5 rounded-full transition-all duration-300',
                      isProcessing && processingProgress.total === 0 ? 'w-1/3 animate-pulse bg-green-400' : 'bg-green-600'
                    )}
                    style={{
                      width:
                        processingProgress.total > 0
                          ? `${(processingProgress.current / processingProgress.total) * 100}%`
                          : undefined,
                    }}
                  />
                </div>
                <p className="text-sm text-gray-600 mt-2 text-center">
                  {processingProgress.lastError
                    ? 'Failed'
                    : processingProgress.total > 0
                      ? `Page ${processingProgress.current} of ${processingProgress.total}`
                      : isProcessing
                        ? 'Preparing…'
                        : processingProgress.current > 0
                          ? 'Complete'
                          : 'Ready'}
                </p>
                {processingProgress.currentFileName && !processingProgress.lastError && (
                  <p
                    className="text-xs text-gray-500 mt-1 text-center truncate"
                    title={processingProgress.currentFileName}
                  >
                    {isProcessing ? 'Processing: ' : 'Last page: '}
                    {processingProgress.currentFileName}
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-1 text-center">
                  {processingProgress.created} created · {processingProgress.enriched} enriched ·{' '}
                  {processingProgress.unchanged} unchanged · {processingProgress.ocrRun} OCR run ·{' '}
                  {processingProgress.errors} errors
                </p>
                {processingProgress.lastError && (
                  <p className="text-xs text-red-600 mt-1 text-center">{processingProgress.lastError}</p>
                )}
              </div>
              {!isProcessing && processingProgress.current === 0 && voterStats && voterStats.totalPages > 0 && (
                <button
                  onClick={() => void runBlockVoterProcess(selectedBlockCode)}
                  className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                >
                  Retry
                </button>
              )}
              <button
                onClick={() => setShowVoterStats(false)}
                disabled={isProcessing}
                className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
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