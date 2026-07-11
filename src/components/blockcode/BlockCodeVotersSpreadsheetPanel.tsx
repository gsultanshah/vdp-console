'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  CheckIcon,
  ExclamationTriangleIcon,
  PhotoIcon,
  PlusCircleIcon,
  SparklesIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import VoterRowPreview from '@/components/voters/VoterRowPreview';
import { BlockCodeVoterAddPanel } from '@/components/blockcode/BlockCodeVoterEditorPanels';
import SpreadsheetFloatingPageViewer, {
  type FloatingPageOption,
} from '@/components/blockcode/SpreadsheetFloatingPageViewer';
import { fetchUploadPageRows } from '@/lib/blockcode-uploads';
import type { BlockCodeContext } from '@/lib/blockcode-hub';
import type { PaginatedVotersResponse, VoterBrowseRecord } from '@/lib/voter-browse-types';
import {
  buildBatchUpdates,
  pickSpreadsheetFields,
  saveVoterBatch,
  SPREADSHEET_EDITABLE_FIELDS,
  SPREADSHEET_RTL_FIELDS,
  SPREADSHEET_SORTABLE_FIELDS,
  SPREADSHEET_SORT_LABELS,
  DEFAULT_SPREADSHEET_SORT,
  isSpreadsheetSortField,
  parseSortDirection,
  type SpreadsheetField,
  type SpreadsheetSortField,
  type SortDirection,
} from '@/lib/voter-batch';
import { fetchVoterById, fetchVoterSpreadsheetPosition } from '@/lib/voter-edit';
import { formatCnicDisplay } from '@/lib/phone-data';
import { genderFromCnic, type GenderFilter } from '@/lib/cnic';
import type { ConstituencyTableColumnSettings } from '@/lib/table-column-settings';
import { blockCodeHubPath, blockCodeSpreadsheetPath, sortBlockCodes } from '@/lib/blockcode-hub';
import { requestSpreadsheetAiFix, fetchBlockSilsilaIndex, type SpreadsheetAiFixItem } from '@/lib/spreadsheet-ai';
import {
  getSpreadsheetFieldIssues,
  hasSilsilaColumnIssue,
  silsilaDuplicateKey,
  type SpreadsheetFieldIssue,
  type SpreadsheetIssueContext,
} from '@/lib/spreadsheet-field-validation';
import {
  buildGenderSilsilaUsageMap,
  detectOrderIssueVoterIds,
  findDuplicateVoterIdsFromUsage,
  getNeighborSilsilaNumbers,
  mergeSilsilaIndexWithEdits,
  type SilsilaIndexEntry,
} from '@/lib/spreadsheet-silsila-validation';
import {
  analyzeBlockSilsilaGaps,
  analyzeSilsilaGapsByPage,
  formatMissingSilsilaList,
  type SilsilaGapReport,
} from '@/lib/spreadsheet-silsila-gaps';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const PAGE_SIZE = 100;
const TAB_NAV_STORAGE_KEY = 'vdp-spreadsheet-tab-navigation';
const GENDER_FILTER_STORAGE_KEY = 'vdp-spreadsheet-gender-filter';
const SORT_BY_STORAGE_KEY = 'vdp-spreadsheet-sort-by';
const SORT_DIR_STORAGE_KEY = 'vdp-spreadsheet-sort-dir';
const PREVIEW_COLSPAN = 2 + SPREADSHEET_EDITABLE_FIELDS.length;

type TabNavigationMode = 'row' | 'column';

interface BlockCodeVotersSpreadsheetPanelProps {
  context: BlockCodeContext;
  onSaved: () => void;
}

function formatCnicInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 13);
  if (digits.length <= 5) return digits;
  if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return formatCnicDisplay(digits);
}

function buildQuery(
  blockCode: string,
  halkaName: string,
  page: number,
  gender: GenderFilter,
  sortBy: SpreadsheetSortField,
  sortDir: SortDirection
): string {
  const params = new URLSearchParams({
    blockCode,
    halkaName,
    page: String(page),
    limit: String(PAGE_SIZE),
    spreadsheet: 'true',
    sortBy,
    sortOrder: sortDir,
  });
  if (gender !== 'both') {
    params.set('gender', gender);
  }
  return params.toString();
}

function cellInputId(rowIndex: number, colIndex: number): string {
  return `spreadsheet-cell-${rowIndex}-${colIndex}`;
}

function getAdjacentCell(
  rowIndex: number,
  colIndex: number,
  mode: TabNavigationMode,
  reverse: boolean,
  rowCount: number,
  colCount: number
): { rowIndex: number; colIndex: number } | null {
  if (mode === 'row') {
    if (!reverse) {
      if (colIndex < colCount - 1) return { rowIndex, colIndex: colIndex + 1 };
      if (rowIndex < rowCount - 1) return { rowIndex: rowIndex + 1, colIndex: 0 };
      return null;
    }

    if (colIndex > 0) return { rowIndex, colIndex: colIndex - 1 };
    if (rowIndex > 0) return { rowIndex: rowIndex - 1, colIndex: colCount - 1 };
    return null;
  }

  if (!reverse) {
    if (rowIndex < rowCount - 1) return { rowIndex: rowIndex + 1, colIndex };
    if (colIndex < colCount - 1) return { rowIndex: 0, colIndex: colIndex + 1 };
    return null;
  }

  if (rowIndex > 0) return { rowIndex: rowIndex - 1, colIndex };
  if (colIndex > 0) return { rowIndex: rowCount - 1, colIndex: colIndex - 1 };
  return null;
}

function focusSpreadsheetCell(
  rowIndex: number,
  colIndex: number,
  mode: TabNavigationMode,
  reverse: boolean,
  rowCount: number,
  deletedRowIds: Set<string>,
  rowIds: string[]
) {
  const colCount = SPREADSHEET_EDITABLE_FIELDS.length;
  let next = getAdjacentCell(rowIndex, colIndex, mode, reverse, rowCount, colCount);
  let attempts = 0;

  while (next && attempts < rowCount * colCount) {
    const rowId = rowIds[next.rowIndex];
    if (rowId && !deletedRowIds.has(rowId)) {
      const input = document.getElementById(cellInputId(next.rowIndex, next.colIndex)) as HTMLInputElement | null;
      if (input && !input.disabled) {
        input.focus();
        input.select();
        return;
      }
    }

    next = getAdjacentCell(next.rowIndex, next.colIndex, mode, reverse, rowCount, colCount);
    attempts += 1;
  }
}

function readTabNavigationSetting(): TabNavigationMode {
  if (typeof window === 'undefined') return 'row';
  const stored = window.localStorage.getItem(TAB_NAV_STORAGE_KEY);
  return stored === 'column' ? 'column' : 'row';
}

function readGenderFilterSetting(): GenderFilter {
  if (typeof window === 'undefined') return 'both';
  const stored = window.localStorage.getItem(GENDER_FILTER_STORAGE_KEY);
  return stored === 'male' || stored === 'female' ? stored : 'both';
}

function readSortSettings(): { sortBy: SpreadsheetSortField; sortDir: SortDirection } {
  if (typeof window === 'undefined') {
    return DEFAULT_SPREADSHEET_SORT;
  }

  const sortBy = window.localStorage.getItem(SORT_BY_STORAGE_KEY);
  const sortDir = window.localStorage.getItem(SORT_DIR_STORAGE_KEY);

  return {
    sortBy: isSpreadsheetSortField(sortBy) ? sortBy : DEFAULT_SPREADSHEET_SORT.sortBy,
    sortDir: parseSortDirection(sortDir),
  };
}

function IconTooltip({ children }: { children: React.ReactNode }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute right-0 top-full z-30 mt-2 w-56 rounded-md bg-gray-900 px-3 py-2 text-left text-xs font-normal leading-snug text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
    >
      {children}
    </span>
  );
}

function issueCellClassName(field: SpreadsheetField, issues: SpreadsheetFieldIssue[]): string {
  if (field === 'silsilaNo' && hasSilsilaColumnIssue(issues)) {
    return 'border-orange-500 bg-orange-50 ring-1 ring-orange-200';
  }
  if (field === 'age' && issues.includes('age')) {
    return 'border-orange-500 bg-orange-50 ring-1 ring-orange-200';
  }
  return '';
}

function SpreadsheetAddVoterModal({
  isOpen,
  onClose,
  context,
  onAdded,
  referenceImageUrl,
  referenceFileName,
  highlightRow,
}: {
  isOpen: boolean;
  onClose: () => void;
  context: BlockCodeContext;
  onAdded: (result: { voterId: string }) => void;
  referenceImageUrl?: string | null;
  referenceFileName?: string | null;
  highlightRow?: {
    rowY: number;
    rowHeight: number;
    pageHeight: number;
  } | null;
}) {
  const { blockCode, halkaName } = context;
  const [pages, setPages] = useState<FloatingPageOption[]>([]);
  const [pageIndex, setPageIndex] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;

    void fetchUploadPageRows({ blockCode, halkaName }, 1, 100)
      .then((result) => {
        if (cancelled) {
          return;
        }
        setPages(
          result.uploads.map((upload) => ({
            id: upload._id,
            url: upload.url,
            fileName: upload.fileName,
          }))
        );
        setPageIndex(0);
      })
      .catch(() => {
        if (!cancelled) {
          setPages([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, blockCode, halkaName]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const activePage = pages[pageIndex];
  const imageUrl = activePage?.url ?? referenceImageUrl ?? null;
  const fileName = activePage?.fileName ?? referenceFileName ?? null;

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/30" onClick={onClose} aria-hidden="true" />
      <div className="pointer-events-none fixed inset-0 z-[61] flex items-start justify-start overflow-y-auto p-4">
        <div
          className="pointer-events-auto relative my-4 w-full max-w-3xl xl:max-w-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 z-10 rounded-lg border border-gray-200 bg-white p-2 text-gray-500 shadow-sm hover:bg-gray-50 hover:text-gray-700"
            aria-label="Close add voter form"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
          <BlockCodeVoterAddPanel
            context={context}
            onAdded={(result) => {
              onAdded(result);
              onClose();
            }}
          />
        </div>
      </div>
      <SpreadsheetFloatingPageViewer
        isOpen={Boolean(imageUrl)}
        imageUrl={imageUrl}
        fileName={fileName}
        pages={pages}
        pageIndex={pageIndex}
        onPageChange={setPageIndex}
        highlightRow={highlightRow}
      />
    </>
  );
}

function SpreadsheetSilsilaGapNotice({
  blockReport,
  pageReports,
}: {
  blockReport: SilsilaGapReport | null;
  pageReports: SilsilaGapReport[];
}) {
  if (!blockReport && pageReports.length === 0) {
    return null;
  }

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-3">
      <div className="flex gap-3">
        <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
        <div className="min-w-0 space-y-2 text-sm text-amber-950">
          <p className="font-semibold">Missing serial numbers — verify silsila</p>
          {blockReport ? (
            <p>
              <span className="font-medium">{blockReport.scopeLabel}</span>: serial range{' '}
              {blockReport.min}–{blockReport.max} is missing {blockReport.missing.length} number
              {blockReport.missing.length !== 1 ? 's' : ''} ({blockReport.presentCount} of{' '}
              {blockReport.expectedCount} present):{' '}
              <span className="font-mono">{formatMissingSilsilaList(blockReport.missing)}</span>
            </p>
          ) : null}
          {pageReports.length > 1
            ? pageReports.map((report) => (
                <p key={report.pageKey ?? report.scopeLabel}>
                  Page <span className="font-medium">{report.scopeLabel}</span>: missing{' '}
                  <span className="font-mono">{formatMissingSilsilaList(report.missing)}</span> in range{' '}
                  {report.min}–{report.max}
                </p>
              ))
            : null}
          {!blockReport && pageReports.length === 1 ? (
            <p>
              Page <span className="font-medium">{pageReports[0].scopeLabel}</span>: serial range{' '}
              {pageReports[0].min}–{pageReports[0].max} is missing {pageReports[0].missing.length} number
              {pageReports[0].missing.length !== 1 ? 's' : ''}:{' '}
              <span className="font-mono">{formatMissingSilsilaList(pageReports[0].missing)}</span>
            </p>
          ) : null}
          <p className="text-xs text-amber-800">
            Every serial from the lowest to the highest should exist. Use AI check or edit silsila manually,
            then save.
          </p>
        </div>
      </div>
    </div>
  );
}

function SpreadsheetShell({
  children,
  fullscreen,
}: {
  children: React.ReactNode;
  fullscreen: boolean;
}) {
  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-white">
        {children}
      </div>
    );
  }

  return <div className="flex flex-col rounded-lg border border-gray-200 bg-white">{children}</div>;
}

function SpreadsheetRowPreviewPanel({
  voter,
  isLoading,
  error,
}: {
  voter: VoterBrowseRecord | null;
  isLoading: boolean;
  error: string | null;
}) {
  if (isLoading) {
    return (
      <div className="rounded-md border border-indigo-100 bg-white p-4">
        <div className="h-24 animate-pulse rounded bg-gray-100" />
        <p className="mt-2 text-xs text-gray-500">Loading page cut…</p>
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (!voter) {
    return null;
  }

  const hasRowPreview =
    Boolean(voter.imageUrl) && voter.rowY != null && voter.rowHeight != null;

  return (
    <div className="rounded-md border border-indigo-100 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Page cut preview</p>
        <p className="text-xs text-gray-500">
          {voter.fileName ? `Source: ${voter.fileName}` : 'Selected row scan'}
        </p>
      </div>
      {hasRowPreview ? (
        <VoterRowPreview
          imageUrl={voter.imageUrl!}
          rowY={voter.rowY!}
          rowHeight={voter.rowHeight!}
          reproduction={voter.reproduction}
          label={voter.name}
          showReproduction={false}
        />
      ) : (
        <p className="text-sm text-gray-500">No page cut available for this voter.</p>
      )}
    </div>
  );
}

function SpreadsheetFullPageOverlay({
  voter,
  isOpen,
  onToggle,
  onClose,
}: {
  voter: VoterBrowseRecord | null;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  if (!voter?.imageUrl) {
    return null;
  }

  const hasRowBand = voter.rowY != null && voter.rowHeight != null;
  const pageHeight = voter.reproduction?.pageHeight ?? voter.reproduction?.pageWidth ?? 3508;
  const highlightTop =
    hasRowBand && pageHeight > 0 ? `${((voter.rowY! / pageHeight) * 100).toFixed(3)}%` : null;
  const highlightHeight =
    hasRowBand && pageHeight > 0 ? `${((voter.rowHeight! / pageHeight) * 100).toFixed(3)}%` : null;

  return (
    <div className="pointer-events-none absolute inset-y-0 right-0 z-20 flex items-start justify-end gap-2 p-2">
      <button
        type="button"
        onClick={onToggle}
        className={`pointer-events-auto rounded-lg border p-2 shadow-md transition-colors ${
          isOpen
            ? 'border-indigo-300 bg-indigo-600 text-white hover:bg-indigo-700'
            : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
        }`}
        title={isOpen ? 'Hide full page' : 'Show full page'}
      >
        <PhotoIcon className="h-5 w-5" />
      </button>

      {isOpen && (
        <div className="pointer-events-auto flex max-h-full w-[min(22rem,calc(100vw-4rem))] flex-col overflow-hidden rounded-lg border border-gray-200 bg-white/95 shadow-xl backdrop-blur-sm">
          <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold uppercase tracking-wide text-gray-700">Full page</p>
              <p className="truncate text-xs text-gray-500" dir="rtl">
                {voter.name}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <a
                href={voter.imageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded p-1.5 text-indigo-600 hover:bg-indigo-50"
                title="Open full page in new tab"
              >
                <ArrowTopRightOnSquareIcon className="h-4 w-4" />
              </a>
              <button
                type="button"
                onClick={onClose}
                className="rounded p-1.5 text-gray-500 hover:bg-gray-100"
                title="Close full page"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={voter.imageUrl}
                alt={`Full page for ${voter.name}`}
                className="block w-full rounded border border-gray-200 bg-gray-50"
              />
              {highlightTop != null && highlightHeight != null && (
                <div
                  className="pointer-events-none absolute left-0 right-0 border-y-2 border-indigo-500 bg-indigo-400/20"
                  style={{ top: highlightTop, height: highlightHeight }}
                />
              )}
            </div>
            {voter.fileName && (
              <p className="mt-2 truncate text-xs text-gray-500">{voter.fileName}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function BlockCodeVotersSpreadsheetPanel({
  context,
  onSaved,
}: BlockCodeVotersSpreadsheetPanelProps) {
  const { blockCode, halkaName } = context;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const blockCodeOptions = useMemo(() => sortBlockCodes(context.blockCodes ?? []), [context.blockCodes]);
  const [rows, setRows] = useState<VoterBrowseRecord[]>([]);
  const [originalsCache, setOriginalsCache] = useState<Record<string, Record<SpreadsheetField, string>>>({});
  const [edits, setEdits] = useState<Record<string, Partial<Record<SpreadsheetField, string>>>>({});
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(() => searchParams.get('spreadsheetFullscreen') === '1');
  const [tabNavigation, setTabNavigation] = useState<TabNavigationMode>(() => readTabNavigationSetting());
  const [genderFilter, setGenderFilter] = useState<GenderFilter>(() => readGenderFilterSetting());
  const [sortBy, setSortBy] = useState<SpreadsheetSortField>(() => readSortSettings().sortBy);
  const [sortDir, setSortDir] = useState<SortDirection>(() => readSortSettings().sortDir);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [previewVoter, setPreviewVoter] = useState<VoterBrowseRecord | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [showFullPageOverlay, setShowFullPageOverlay] = useState(false);
  const [columnSettings, setColumnSettings] = useState<ConstituencyTableColumnSettings | null>(null);
  const [aiHighlightActive, setAiHighlightActive] = useState(false);
  const [isAiFixing, setIsAiFixing] = useState(false);
  const [silsilaIndex, setSilsilaIndex] = useState<SilsilaIndexEntry[]>([]);
  const [showAddVoterModal, setShowAddVoterModal] = useState(false);
  const [highlightedVoterId, setHighlightedVoterId] = useState<string | null>(null);
  const skipFilterResetRef = useRef(false);
  const preserveSelectionRef = useRef(false);
  const suppressAutoLoadRef = useRef(false);

  const getRowFields = useCallback(
    (rowId: string): Record<SpreadsheetField, string> => {
      const original = originalsCache[rowId];
      const empty = Object.fromEntries(
        SPREADSHEET_EDITABLE_FIELDS.map((field) => [field, ''])
      ) as Record<SpreadsheetField, string>;

      if (!original) {
        return empty;
      }

      const merged = { ...original };
      for (const field of SPREADSHEET_EDITABLE_FIELDS) {
        if (edits[rowId]?.[field] !== undefined) {
          merged[field] = edits[rowId][field] ?? '';
        }
      }
      return merged;
    },
    [originalsCache, edits]
  );

  const silsilaOverrides = useMemo(() => {
    const overrides = new Map<string, string>();
    for (const row of rows) {
      const fields = getRowFields(row._id);
      overrides.set(row._id, fields.silsilaNo);
    }
    return overrides;
  }, [rows, getRowFields]);

  const effectiveSilsilaEntries = useMemo(
    () => mergeSilsilaIndexWithEdits(silsilaIndex, silsilaOverrides),
    [silsilaIndex, silsilaOverrides]
  );

  const silsilaValidation = useMemo(() => {
    const usage = buildGenderSilsilaUsageMap(effectiveSilsilaEntries);
    return {
      duplicateVoterIds: findDuplicateVoterIdsFromUsage(usage),
      usage,
    };
  }, [effectiveSilsilaEntries]);

  const pageOrderIssueVoterIds = useMemo(() => {
    const pageEntries = rows
      .filter((row) => !deletedIds.has(row._id))
      .map((row) => ({
        id: row._id,
        silsilaNo: getRowFields(row._id).silsilaNo,
        row: row.row,
        pageKey: row.imageUrl ?? row.fileName ?? '',
      }));
    return detectOrderIssueVoterIds(pageEntries);
  }, [rows, deletedIds, getRowFields]);

  const issueContextBase = useMemo(
    (): Omit<SpreadsheetIssueContext, 'voterId'> => ({
      duplicateVoterIds: silsilaValidation.duplicateVoterIds,
      orderIssueVoterIds: pageOrderIssueVoterIds,
    }),
    [silsilaValidation, pageOrderIssueVoterIds]
  );

  const rowFieldIssues = useCallback(
    (rowId: string): SpreadsheetFieldIssue[] =>
      getSpreadsheetFieldIssues(getRowFields(rowId), {
        ...issueContextBase,
        voterId: rowId,
      }),
    [getRowFields, issueContextBase]
  );

  const issueRowsOnPage = useMemo(
    () =>
      rows.filter((row) => {
        if (deletedIds.has(row._id)) {
          return false;
        }
        return rowFieldIssues(row._id).length > 0;
      }),
    [rows, deletedIds, rowFieldIssues]
  );

  const silsilaEntriesForGapCheck = useMemo(
    () =>
      effectiveSilsilaEntries.filter((entry) => {
        if (genderFilter === 'both') {
          return true;
        }
        return genderFromCnic(entry.cnic ?? '') === genderFilter;
      }),
    [effectiveSilsilaEntries, genderFilter]
  );

  const silsilaGapSummary = useMemo(() => {
    const blockScopeLabel =
      genderFilter === 'male'
        ? 'Male voters in block'
        : genderFilter === 'female'
          ? 'Female voters in block'
          : 'All voters in block';

    return {
      blockReport: analyzeBlockSilsilaGaps(silsilaEntriesForGapCheck, blockScopeLabel),
      pageReports: analyzeSilsilaGapsByPage(silsilaEntriesForGapCheck),
    };
  }, [silsilaEntriesForGapCheck, genderFilter]);

  const pendingCount = useMemo(() => {
    const updateCount = buildBatchUpdates(originalsCache, edits).length;
    return updateCount + deletedIds.size;
  }, [originalsCache, edits, deletedIds]);

  const hasPendingChanges = pendingCount > 0;

  useEffect(() => {
    let cancelled = false;

    void fetch(`/api/constituency/table-columns/?halkaName=${encodeURIComponent(halkaName)}`)
      .then(async (response) => {
        const data = (await response.json()) as { tableColumnSettings?: ConstituencyTableColumnSettings | null };
        if (!cancelled && response.ok) {
          setColumnSettings(data.tableColumnSettings ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setColumnSettings(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [halkaName]);

  const loadSilsilaIndex = useCallback(async () => {
    try {
      const data = await fetchBlockSilsilaIndex(blockCode, halkaName);
      setSilsilaIndex(data.entries);
    } catch {
      setSilsilaIndex([]);
    }
  }, [blockCode, halkaName]);

  useEffect(() => {
    void loadSilsilaIndex();
  }, [loadSilsilaIndex]);

  const loadPage = useCallback(
    async (
      page: number,
      overrides?: Partial<{
        genderFilter: GenderFilter;
        sortBy: SpreadsheetSortField;
        sortDir: SortDirection;
      }>
    ): Promise<PaginatedVotersResponse | null> => {
      const activeGender = overrides?.genderFilter ?? genderFilter;
      const activeSortBy = overrides?.sortBy ?? sortBy;
      const activeSortDir = overrides?.sortDir ?? sortDir;

      setIsLoading(true);
      setLoadError(null);
      try {
        const response = await fetch(
          `/api/voters/?${buildQuery(blockCode, halkaName, page, activeGender, activeSortBy, activeSortDir)}`
        );
        if (!response.ok) throw new Error('Failed to load voters');

        const data: PaginatedVotersResponse = await response.json();

        setOriginalsCache((current) => {
          const next = { ...current };
          for (const voter of data.voters) {
            next[voter._id] = pickSpreadsheetFields(voter, columnSettings);
          }
          return next;
        });

        setRows(data.voters);
        setCurrentPage(data.currentPage);
        setTotalPages(data.totalPages);
        setTotal(data.total);
        return data;
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'Failed to load voters');
        setRows([]);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [blockCode, halkaName, genderFilter, sortBy, sortDir, columnSettings]
  );

  useEffect(() => {
    if (skipFilterResetRef.current) {
      skipFilterResetRef.current = false;
      return;
    }
    setCurrentPage(1);
    setSelectedRowId(null);
    setPreviewVoter(null);
    setPreviewError(null);
    setShowFullPageOverlay(false);
    setAiHighlightActive(false);
  }, [genderFilter, sortBy, sortDir]);

  useEffect(() => {
    if (suppressAutoLoadRef.current) {
      suppressAutoLoadRef.current = false;
      return;
    }
    void loadPage(currentPage);
  }, [loadPage, currentPage]);

  useEffect(() => {
    if (!highlightedVoterId) {
      return;
    }

    const timer = window.setTimeout(() => {
      setHighlightedVoterId(null);
    }, 10000);

    return () => window.clearTimeout(timer);
  }, [highlightedVoterId]);

  useEffect(() => {
    if (preserveSelectionRef.current) {
      preserveSelectionRef.current = false;
      return;
    }
    setSelectedRowId(null);
    setPreviewVoter(null);
    setPreviewError(null);
    setShowFullPageOverlay(false);
    setAiHighlightActive(false);
  }, [currentPage]);

  useEffect(() => {
    if (!selectedRowId) {
      setPreviewVoter(null);
      setPreviewError(null);
      setIsLoadingPreview(false);
      return;
    }

    let cancelled = false;
    setIsLoadingPreview(true);
    setPreviewError(null);

    void fetchVoterById(selectedRowId)
      .then((voter) => {
        if (!cancelled) {
          setPreviewVoter(voter);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setPreviewVoter(null);
          setPreviewError(error instanceof Error ? error.message : 'Failed to load page cut');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingPreview(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedRowId]);

  useEffect(() => {
    if (!aiHighlightActive) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAiHighlightActive(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [aiHighlightActive]);

  useEffect(() => {
    setFullscreen(searchParams.get('spreadsheetFullscreen') === '1');
  }, [searchParams, blockCode]);

  useEffect(() => {
    if (!fullscreen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [fullscreen]);

  const getCellValue = (rowId: string, field: SpreadsheetField): string => {
    if (edits[rowId]?.[field] !== undefined) {
      return edits[rowId][field] ?? '';
    }
    return originalsCache[rowId]?.[field] ?? '';
  };

  const updateCell = (rowId: string, field: SpreadsheetField, value: string) => {
    const originalValue = originalsCache[rowId]?.[field] ?? '';
    const normalized = field === 'cnic' ? formatCnicInput(value) : value;

    setEdits((current) => {
      const rowEdits = { ...(current[rowId] ?? {}) };

      if (normalized === originalValue) {
        delete rowEdits[field];
      } else {
        rowEdits[field] = normalized;
      }

      const next = { ...current };
      if (Object.keys(rowEdits).length === 0) {
        delete next[rowId];
      } else {
        next[rowId] = rowEdits;
      }
      return next;
    });
  };

  const applyAiFieldUpdates = (
    rowId: string,
    updates: Partial<Record<SpreadsheetField, string>>
  ) => {
    setEdits((current) => {
      const next = { ...current };
      const rowEdits = { ...(next[rowId] ?? {}) };
      const original = originalsCache[rowId];

      for (const field of SPREADSHEET_EDITABLE_FIELDS) {
        const value = updates[field];
        if (value == null || value === '') {
          continue;
        }

        const normalized = field === 'cnic' ? formatCnicInput(value) : value;
        const originalValue = original?.[field] ?? '';

        if (normalized === originalValue) {
          delete rowEdits[field];
        } else {
          rowEdits[field] = normalized;
        }
      }

      if (Object.keys(rowEdits).length === 0) {
        delete next[rowId];
      } else {
        next[rowId] = rowEdits;
      }
      return next;
    });
  };

  const handleAiAssistClick = async () => {
    if (isAiFixing || isSaving) {
      return;
    }

    if (!aiHighlightActive) {
      setAiHighlightActive(true);
      if (issueRowsOnPage.length === 0) {
        toast('No silsila order, duplicate, or age issues on this page');
      } else {
        toast.success(
          `Highlighted ${issueRowsOnPage.length} row(s) — bad serial, duplicate within gender, wrong order, missing/invalid age`
        );
      }
      return;
    }

    const rowsToFix = issueRowsOnPage;
    if (rowsToFix.length === 0) {
      setAiHighlightActive(false);
      toast('No issues left on this page');
      return;
    }

    setIsAiFixing(true);
    try {
      const fixes: SpreadsheetAiFixItem[] = rowsToFix.map((row) => {
        const fields = getRowFields(row._id);
        const issues = rowFieldIssues(row._id);
        const neighbors = getNeighborSilsilaNumbers(effectiveSilsilaEntries, row._id);
        const silsila = silsilaDuplicateKey(fields.silsilaNo);

        return {
          id: row._id,
          currentSilsilaNo: fields.silsilaNo,
          currentAge: fields.age,
          issues,
          neighborBeforeSilsila: neighbors.before,
          neighborAfterSilsila: neighbors.after,
          duplicateSilsilaInBlock:
            issues.includes('duplicate') && silsila ? [silsila] : undefined,
        };
      });

      const { results, message } = await requestSpreadsheetAiFix(fixes);
      let applied = 0;
      let failed = 0;

      for (const result of results) {
        if (result.error) {
          failed += 1;
          continue;
        }

        const issues = rowFieldIssues(result.id);
        const updates: Partial<Record<SpreadsheetField, string>> = {};

        if (result.silsilaNo && hasSilsilaColumnIssue(issues)) {
          updates.silsilaNo = result.silsilaNo;
        }
        if (result.age && issues.includes('age')) {
          updates.age = result.age;
        }

        if (Object.keys(updates).length > 0) {
          applyAiFieldUpdates(result.id, updates);
          applied += 1;
        }
      }

      if (applied > 0) {
        toast.success(message || `AI updated ${applied} row(s) from page cuts. Review edits, then Save.`);
      } else if (failed > 0) {
        toast.error(`${failed} row(s) could not be read from page cut`);
      } else {
        toast.error('AI did not return usable silsila or age values');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'AI fix failed');
    } finally {
      setIsAiFixing(false);
    }
  };

  const toggleDelete = (rowId: string) => {
    setDeletedIds((current) => {
      const next = new Set(current);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  };

  const discardChanges = () => {
    if (!hasPendingChanges || window.confirm('Discard all unsaved changes?')) {
      setEdits({});
      setDeletedIds(new Set());
      setOriginalsCache({});
      void loadPage(currentPage);
    }
  };

  const goToPage = (page: number) => {
    const nextPage = Math.min(Math.max(1, page), totalPages);
    if (nextPage === currentPage) return;
    setCurrentPage(nextPage);
  };

  const handleSave = async () => {
    if (!hasPendingChanges) return;

    const updates = buildBatchUpdates(originalsCache, edits);
    const deletes = Array.from(deletedIds);

    setIsSaving(true);
    try {
      const result = await saveVoterBatch({ updates, deletes });
      const errorCount = result.errors?.length ?? 0;

      if (errorCount > 0) {
        toast.error(`${result.updated} updated, ${result.deleted} deleted, ${errorCount} failed`);
      } else {
        toast.success(`Saved ${result.updated} update(s) and ${result.deleted} deletion(s)`);
      }

      setEdits({});
      setDeletedIds(new Set());
      setOriginalsCache({});
      await loadPage(currentPage);
      await loadSilsilaIndex();
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  const isRowDirty = (rowId: string) => {
    if (deletedIds.has(rowId)) return true;
    const rowEdits = edits[rowId];
    if (!rowEdits) return false;
    return SPREADSHEET_EDITABLE_FIELDS.some(
      (field) => rowEdits[field] !== undefined && rowEdits[field] !== originalsCache[rowId]?.[field]
    );
  };

  const handleTabNavigationChange = (mode: TabNavigationMode) => {
    setTabNavigation(mode);
    window.localStorage.setItem(TAB_NAV_STORAGE_KEY, mode);
  };

  const handleGenderFilterChange = (gender: GenderFilter) => {
    setGenderFilter(gender);
    window.localStorage.setItem(GENDER_FILTER_STORAGE_KEY, gender);
  };

  const handleSortByChange = (field: SpreadsheetSortField) => {
    setSortBy(field);
    window.localStorage.setItem(SORT_BY_STORAGE_KEY, field);
  };

  const handleSortDirChange = (direction: SortDirection) => {
    setSortDir(direction);
    window.localStorage.setItem(SORT_DIR_STORAGE_KEY, direction);
  };

  const syncFullscreenInUrl = useCallback(
    (nextFullscreen: boolean) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', 'voters');
      params.set('voterMode', 'spreadsheet');
      if (nextFullscreen) {
        params.set('spreadsheetFullscreen', '1');
      } else {
        params.delete('spreadsheetFullscreen');
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const setFullscreenMode = useCallback(
    (nextFullscreen: boolean) => {
      setFullscreen(nextFullscreen);
      syncFullscreenInUrl(nextFullscreen);
    },
    [syncFullscreenInUrl]
  );

  const handleBlockCodeJump = (nextBlockCode: string) => {
    if (!nextBlockCode || nextBlockCode === blockCode) {
      return;
    }
    if (hasPendingChanges && !window.confirm('You have unsaved changes that will be lost. Jump to another block code?')) {
      return;
    }
    router.push(
      fullscreen
        ? blockCodeSpreadsheetPath(nextBlockCode, halkaName, { fullscreen: true })
        : blockCodeHubPath(nextBlockCode, halkaName, 'voters', { voterMode: 'spreadsheet' })
    );
  };

  const handleVoterAdded = useCallback(
    async ({ voterId }: { voterId: string }) => {
      if (!voterId) {
        toast.error('Voter was saved but could not be highlighted in the list');
        await loadPage(currentPage);
        await loadSilsilaIndex();
        onSaved();
        return;
      }

      const reloadOverrides = {
        genderFilter: 'both' as GenderFilter,
        sortBy: 'silsilaNo' as SpreadsheetSortField,
        sortDir: 'asc' as SortDirection,
      };

      try {
        const position =
          (await fetchVoterSpreadsheetPosition({
            voterId,
            blockCode,
            halkaName,
            gender: 'both',
            sortBy: 'silsilaNo',
            sortOrder: 'asc',
            pageSize: PAGE_SIZE,
          })) ??
          (await fetchVoterSpreadsheetPosition({
            voterId,
            blockCode,
            halkaName,
            gender: genderFilter,
            sortBy: sortBy,
            sortOrder: sortDir,
            pageSize: PAGE_SIZE,
          }));

        const targetPage = position?.page ?? currentPage;

        skipFilterResetRef.current = true;
        setSortBy('silsilaNo');
        setSortDir('asc');
        setGenderFilter('both');
        window.localStorage.setItem(SORT_BY_STORAGE_KEY, 'silsilaNo');
        window.localStorage.setItem(SORT_DIR_STORAGE_KEY, 'asc');
        window.localStorage.setItem(GENDER_FILTER_STORAGE_KEY, 'both');

        suppressAutoLoadRef.current = true;
        preserveSelectionRef.current = true;
        const pageData = await loadPage(targetPage, reloadOverrides);

        if (!pageData?.voters.some((row) => row._id === voterId)) {
          suppressAutoLoadRef.current = true;
          preserveSelectionRef.current = true;
          const fallback = await loadPage(1, reloadOverrides);
          if (!fallback?.voters.some((row) => row._id === voterId)) {
            toast.error(`Saved to ${halkaName} / ${blockCode}, but could not locate row in spreadsheet`);
            await loadSilsilaIndex();
            onSaved();
            return;
          }
        }

        setSelectedRowId(voterId);
        setHighlightedVoterId(voterId);
        await loadSilsilaIndex();
        onSaved();

        requestAnimationFrame(() => {
          document
            .querySelector(`[data-voter-row="${voterId}"]`)
            ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to refresh after add');
        suppressAutoLoadRef.current = true;
        await loadPage(currentPage, reloadOverrides);
        await loadSilsilaIndex();
        onSaved();
      }
    },
    [blockCode, halkaName, currentPage, genderFilter, loadPage, loadSilsilaIndex, onSaved, sortBy, sortDir]
  );

  const handleOpenAddVoter = () => {
    if (hasPendingChanges && !window.confirm('You have unsaved spreadsheet changes. Open add voter anyway?')) {
      return;
    }
    setShowAddVoterModal(true);
  };

  const genderFilterLabel =
    genderFilter === 'male' ? 'Male only' : genderFilter === 'female' ? 'Female only' : 'Both';

  const handleCellKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    colIndex: number,
    rowId: string
  ) => {
    if (event.key === 'Tab') {
      event.preventDefault();
      focusSpreadsheetCell(
        rowIndex,
        colIndex,
        tabNavigation,
        event.shiftKey,
        rows.length,
        deletedIds,
        rows.map((row) => row._id)
      );
      return;
    }

    if (selectedRowId !== rowId) {
      setSelectedRowId(rowId);
    }
  };

  const handleCellFocus = (rowId: string) => {
    if (selectedRowId !== rowId) {
      setSelectedRowId(rowId);
    }
  };

  const addVoterReferenceRow = previewVoter ?? rows.find((row) => row.imageUrl) ?? null;
  const addVoterHighlightRow =
    addVoterReferenceRow?.rowY != null && addVoterReferenceRow.rowHeight != null
      ? {
          rowY: addVoterReferenceRow.rowY,
          rowHeight: addVoterReferenceRow.rowHeight,
          pageHeight:
            addVoterReferenceRow.reproduction?.pageHeight ??
            addVoterReferenceRow.reproduction?.pageWidth ??
            3508,
        }
      : null;

  return (
    <SpreadsheetShell fullscreen={fullscreen}>
      <div className={`flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 ${fullscreen ? 'shrink-0' : ''}`}>
        <div>
          <h3 className="text-base font-semibold text-gray-900">Spreadsheet editor</h3>
          <p className="text-sm text-gray-500">
            {total.toLocaleString()} voters · {genderFilterLabel} · sorted by {SPREADSHEET_SORT_LABELS[sortBy]}{' '}
            ({sortDir === 'asc' ? 'A→Z' : 'Z→A'}) · 100 per page
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-700">
            <span className="whitespace-nowrap">Sort by</span>
            <select
              value={sortBy}
              onChange={(e) => handleSortByChange(e.target.value as SpreadsheetSortField)}
              className="rounded border border-gray-300 bg-white px-2 py-1 text-sm"
            >
              {SPREADSHEET_SORTABLE_FIELDS.map((field) => (
                <option key={field} value={field}>
                  {SPREADSHEET_SORT_LABELS[field]}
                </option>
              ))}
            </select>
            <select
              value={sortDir}
              onChange={(e) => handleSortDirChange(e.target.value as SortDirection)}
              className="rounded border border-gray-300 bg-white px-2 py-1 text-sm"
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </label>
          <label className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-700">
            <span className="whitespace-nowrap">Show</span>
            <select
              value={genderFilter}
              onChange={(e) => handleGenderFilterChange(e.target.value as GenderFilter)}
              className="rounded border border-gray-300 bg-white px-2 py-1 text-sm"
            >
              <option value="both">Both</option>
              <option value="male">Male only</option>
              <option value="female">Female only</option>
            </select>
          </label>
          <label className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-700">
            <span className="whitespace-nowrap">Tab moves</span>
            <select
              value={tabNavigation}
              onChange={(e) => handleTabNavigationChange(e.target.value as TabNavigationMode)}
              className="rounded border border-gray-300 bg-white px-2 py-1 text-sm"
            >
              <option value="row">Next cell in row →</option>
              <option value="column">Next cell in column ↓</option>
            </select>
          </label>
          <button
            type="button"
            onClick={handleOpenAddVoter}
            disabled={isSaving}
            className="group relative inline-flex items-center justify-center rounded-lg border border-emerald-300 bg-emerald-50 p-2 text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
            aria-label="Add voter"
          >
            <PlusCircleIcon className="h-5 w-5" />
            <IconTooltip>Add voter — open form with page scan on the right</IconTooltip>
          </button>
          <button
            type="button"
            onClick={() => void handleAiAssistClick()}
            disabled={isLoading || isSaving || isAiFixing}
            className={`group relative inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm disabled:opacity-50 ${
              aiHighlightActive
                ? 'border-orange-300 bg-orange-50 text-orange-900 hover:bg-orange-100'
                : 'border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100'
            }`}
            aria-label={aiHighlightActive ? 'Fix highlighted rows with AI' : 'Highlight silsila and age issues'}
            title={
              aiHighlightActive
                ? 'Read silsila and age from page cuts with OpenAI (review then Save)'
                : 'Highlight duplicate serial (same gender), missing age, or invalid age; click again to fix from page cut'
            }
          >
            <SparklesIcon className={`h-4 w-4 ${isAiFixing ? 'animate-pulse' : ''}`} />
            <span>{isAiFixing ? 'AI reading…' : aiHighlightActive ? 'Fix with AI' : 'AI check'}</span>
            {issueRowsOnPage.length > 0 && (
              <span className="rounded-full bg-orange-200 px-2 py-0.5 text-xs font-semibold text-orange-900">
                {issueRowsOnPage.length}
              </span>
            )}
            {fullscreen ? (
              <IconTooltip>
                {aiHighlightActive
                  ? 'Click again to read silsila and age from page cuts with OpenAI. Serial must be unique across male and female. Review edits, then Save. Esc clears highlights.'
                  : 'Highlight non-numeric serial, duplicate silsila within male or female lists, wrong order, missing/invalid age. Click again to fix from page cut with AI.'}
              </IconTooltip>
            ) : null}
          </button>
          {aiHighlightActive && (
            <button
              type="button"
              onClick={() => setAiHighlightActive(false)}
              className="rounded-lg border border-gray-300 px-2 py-2 text-xs text-gray-600 hover:bg-gray-50"
            >
              Clear highlights
            </button>
          )}
          {fullscreen && blockCodeOptions.length > 0 && (
            <label className="group relative inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-700">
              <span className="whitespace-nowrap">Block</span>
              <select
                value={blockCode}
                onChange={(e) => handleBlockCodeJump(e.target.value)}
                className="rounded border border-gray-300 bg-white px-2 py-1 text-sm"
                title="Jump to another block code (stays in Voters tab)"
              >
                {blockCodeOptions.map((code) => (
                  <option key={code} value={code}>
                    {code}
                    {code === blockCode ? ' · current' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          {hasPendingChanges && (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
              {pendingCount} unsaved change{pendingCount !== 1 ? 's' : ''}
            </span>
          )}
          {fullscreen ? (
            <>
              <button
                type="button"
                onClick={() => void loadPage(currentPage)}
                disabled={isLoading || isSaving}
                className="group relative inline-flex items-center justify-center rounded-lg border border-gray-300 p-2 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                aria-label="Reload current page"
              >
                <ArrowPathIcon className={`h-5 w-5 ${isLoading ? 'animate-spin' : ''}`} />
                <IconTooltip>Reload — discard local edits on this page and refetch from server</IconTooltip>
              </button>
              <button
                type="button"
                onClick={discardChanges}
                disabled={!hasPendingChanges || isSaving}
                className="group relative inline-flex items-center justify-center rounded-lg border border-gray-300 p-2 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                aria-label="Discard unsaved changes"
              >
                <XMarkIcon className="h-5 w-5" />
                <IconTooltip>Discard — clear all unsaved edits and deletions without saving</IconTooltip>
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={!hasPendingChanges || isSaving}
                className="group relative inline-flex items-center justify-center rounded-lg bg-indigo-600 p-2 text-white hover:bg-indigo-700 disabled:opacity-50"
                aria-label="Save changes"
              >
                <CheckIcon className="h-5 w-5" />
                <IconTooltip>{isSaving ? 'Saving your changes…' : 'Save — persist all edits and deletions to the database'}</IconTooltip>
              </button>
              <button
                type="button"
                onClick={() => setFullscreenMode(false)}
                className="group relative inline-flex items-center justify-center rounded-lg border border-gray-300 p-2 text-gray-700 hover:bg-gray-50"
                aria-label="Exit full screen"
              >
                <ArrowsPointingInIcon className="h-5 w-5" />
                <IconTooltip>Exit full screen — return to the normal layout</IconTooltip>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void loadPage(currentPage)}
                disabled={isLoading || isSaving}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <ArrowPathIcon className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                Reload
              </button>
              <button
                type="button"
                onClick={discardChanges}
                disabled={!hasPendingChanges || isSaving}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <XMarkIcon className="h-4 w-4" />
                Discard
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={!hasPendingChanges || isSaving}
                className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                <CheckIcon className="h-4 w-4" />
                {isSaving ? 'Saving…' : 'Save changes'}
              </button>
              <button
                type="button"
                onClick={() => setFullscreenMode(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                title="Full screen"
              >
                <ArrowsPointingOutIcon className="h-4 w-4" />
                Full screen
              </button>
            </>
          )}
        </div>
      </div>

      <SpreadsheetSilsilaGapNotice
        blockReport={silsilaGapSummary.blockReport}
        pageReports={silsilaGapSummary.pageReports}
      />

      <div className={`relative ${fullscreen ? 'min-h-0 flex-1' : ''}`}>
        <div className={`overflow-auto ${fullscreen ? 'h-full' : 'max-h-[36rem]'}`}>
          {loadError ? (
            <p className="p-4 text-sm text-red-600">{loadError}</p>
          ) : isLoading && rows.length === 0 ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 10 }, (_, i) => (
                <div key={i} className="h-9 animate-pulse rounded bg-gray-100" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">No voters in this block.</p>
          ) : (
            <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="sticky top-0 z-10 bg-gray-50">
              <tr>
                <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  #
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Del
                </th>
                {SPREADSHEET_EDITABLE_FIELDS.map((field) => (
                  <th
                    key={field}
                    className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                  >
                    {SPREADSHEET_SORT_LABELS[field]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {rows.map((row, index) => {
                const rowNumber = (currentPage - 1) * PAGE_SIZE + index + 1;
                const isDeleted = deletedIds.has(row._id);
                const dirty = isRowDirty(row._id);
                const isSelected = selectedRowId === row._id;
                const issues = aiHighlightActive ? rowFieldIssues(row._id) : [];
                const isNewlyAdded = highlightedVoterId === row._id;
                const hasIssueHighlight = aiHighlightActive && issues.length > 0;

                return (
                  <Fragment key={row._id}>
                    <tr
                      data-voter-row={row._id}
                      className={`${
                        isDeleted
                          ? 'bg-red-50 opacity-60'
                          : isNewlyAdded
                            ? 'bg-emerald-100 ring-2 ring-inset ring-emerald-400'
                          : hasIssueHighlight
                            ? 'bg-orange-50/80'
                            : isSelected
                              ? 'bg-indigo-50'
                              : dirty
                                ? 'bg-amber-50/70'
                                : ''
                      }`}
                    >
                      <td className="whitespace-nowrap px-3 py-1.5 text-xs text-gray-400">{rowNumber}</td>
                      <td className="whitespace-nowrap px-3 py-1.5">
                        <button
                          type="button"
                          onClick={() => toggleDelete(row._id)}
                          className={`rounded p-1 ${isDeleted ? 'bg-red-100 text-red-700' : 'text-gray-400 hover:bg-gray-100 hover:text-red-600'}`}
                          title={isDeleted ? 'Undo delete' : 'Mark for deletion'}
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </td>
                      {SPREADSHEET_EDITABLE_FIELDS.map((field, colIndex) => (
                        <td key={field} className="px-2 py-1">
                          <input
                            id={cellInputId(index, colIndex)}
                            value={getCellValue(row._id, field)}
                            onChange={(e) => updateCell(row._id, field, e.target.value)}
                            onFocus={() => handleCellFocus(row._id)}
                            onKeyDown={(e) => handleCellKeyDown(e, index, colIndex, row._id)}
                            disabled={isDeleted}
                            dir={SPREADSHEET_RTL_FIELDS.has(field) ? 'rtl' : undefined}
                            className={`w-full min-w-[5.5rem] rounded border px-2 py-1 text-sm disabled:bg-gray-100 disabled:text-gray-400 ${
                              field === 'cnic' ? 'font-mono' : ''
                            } ${
                              hasIssueHighlight
                                ? issueCellClassName(field, issues)
                                : isSelected
                                  ? 'border-indigo-400 ring-1 ring-indigo-200'
                                  : edits[row._id]?.[field] !== undefined &&
                                      edits[row._id]?.[field] !== originalsCache[row._id]?.[field]
                                    ? 'border-amber-400 bg-amber-50'
                                    : 'border-gray-200'
                            }`}
                          />
                        </td>
                      ))}
                    </tr>
                    {isSelected && (
                      <tr className="bg-indigo-50/60">
                        <td colSpan={PREVIEW_COLSPAN} className="px-4 py-3">
                          <SpreadsheetRowPreviewPanel
                            voter={previewVoter}
                            isLoading={isLoadingPreview}
                            error={previewError}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          )}
        </div>

        <SpreadsheetFullPageOverlay
          voter={previewVoter}
          isOpen={showFullPageOverlay}
          onToggle={() => setShowFullPageOverlay((value) => !value)}
          onClose={() => setShowFullPageOverlay(false)}
        />
      </div>

      <div className={`flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-4 py-3 ${fullscreen ? 'shrink-0' : ''}`}>
        <p className="text-sm text-gray-500">
          Page {currentPage} of {totalPages} · showing {rows.length} of {total.toLocaleString()}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1 || isLoading}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Previous
          </button>
          <input
            type="number"
            min={1}
            max={totalPages}
            value={currentPage}
            onChange={(e) => goToPage(Number(e.target.value))}
            className="w-16 rounded-lg border border-gray-300 px-2 py-1.5 text-center text-sm"
          />
          <button
            type="button"
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= totalPages || isLoading}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      <SpreadsheetAddVoterModal
        isOpen={showAddVoterModal}
        onClose={() => setShowAddVoterModal(false)}
        context={context}
        onAdded={(result) => void handleVoterAdded(result)}
        referenceImageUrl={addVoterReferenceRow?.imageUrl ?? null}
        referenceFileName={addVoterReferenceRow?.fileName ?? null}
        highlightRow={addVoterHighlightRow}
      />
    </SpreadsheetShell>
  );
}
