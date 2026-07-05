'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import {
  ExclamationTriangleIcon,
  SparklesIcon,
  XMarkIcon,
  ChevronRightIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import type { ConstituencyTableColumnSettings } from '@/lib/table-column-settings';
import type { VoterBrowseRecord } from '@/lib/voter-browse-types';
import { requestSpreadsheetAiFix, fetchBlockSilsilaIndex } from '@/lib/spreadsheet-ai';
import { saveVoterBatch } from '@/lib/voter-batch';
import { formatMissingSilsilaList, type SilsilaGapReport } from '@/lib/spreadsheet-silsila-gaps';
import {
  AI_FIX_BATCH_SIZE,
  AI_FIX_EDITABLE_FIELDS,
  buildAiFixItems,
  buildBatchValidationState,
  buildOriginalsMap,
  buildSaveUpdates,
  hasSilsilaColumnIssue,
  issueSummaryLabel,
  loadAiFixBatchVoters,
  mergeRowFields,
  rowFieldIssues,
  type AiFixEditableField,
  type AiFixGender,
} from '@/lib/blockcode-ai-fix-batch';

type AiFixStage = 'identify' | 'edit' | 'review';

interface BlockCodeAiFixModalProps {
  isOpen: boolean;
  onClose: () => void;
  blockCode: string;
  halkaName: string;
  onSaved?: () => void;
}

function batchStorageKey(halkaName: string, blockCode: string, gender: AiFixGender) {
  return `ai-fix-batch-${halkaName}-${blockCode}-${gender}`;
}

function readNextBatchPage(halkaName: string, blockCode: string, gender: AiFixGender) {
  if (typeof window === 'undefined') {
    return 1;
  }
  const raw = sessionStorage.getItem(batchStorageKey(halkaName, blockCode, gender));
  const parsed = raw ? Number.parseInt(raw, 10) : 1;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function writeNextBatchPage(halkaName: string, blockCode: string, gender: AiFixGender, page: number) {
  sessionStorage.setItem(batchStorageKey(halkaName, blockCode, gender), String(page));
}

const GENDER_TABS: { id: AiFixGender; label: string }[] = [
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
];

function SilsilaGapNotice({
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
              <span className="font-medium">{blockReport.scopeLabel}</span>: serial range {blockReport.min}–
              {blockReport.max} is missing {blockReport.missing.length} number
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
        </div>
      </div>
    </div>
  );
}

const STAGE_STEPS: { id: AiFixStage; label: string }[] = [
  { id: 'identify', label: 'Identify' },
  { id: 'edit', label: 'Edit & AI Fix' },
  { id: 'review', label: 'Review & Save' },
];

function stageIndex(stage: AiFixStage) {
  return STAGE_STEPS.findIndex((step) => step.id === stage);
}

function issueCellClass(hasIssue: boolean) {
  return hasIssue ? 'bg-amber-100 ring-1 ring-inset ring-amber-300' : '';
}

export default function BlockCodeAiFixModal({
  isOpen,
  onClose,
  blockCode,
  halkaName,
  onSaved,
}: BlockCodeAiFixModalProps) {
  const [stage, setStage] = useState<AiFixStage>('identify');
  const [genderFilter, setGenderFilter] = useState<AiFixGender>('male');
  const [batchPage, setBatchPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalVoters, setTotalVoters] = useState(0);
  const [voters, setVoters] = useState<VoterBrowseRecord[]>([]);
  const [silsilaIndex, setSilsilaIndex] = useState<
    import('@/lib/spreadsheet-silsila-validation').SilsilaIndexEntry[]
  >([]);
  const [columnSettings, setColumnSettings] = useState<ConstituencyTableColumnSettings | null>(null);
  const [originals, setOriginals] = useState<Record<string, Record<AiFixEditableField, string>>>({});
  const [edits, setEdits] = useState<Record<string, Partial<Record<AiFixEditableField, string>>>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isAiFixing, setIsAiFixing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savedBatch, setSavedBatch] = useState(false);

  const validation = useMemo(
    () => buildBatchValidationState(silsilaIndex, voters, originals, edits, genderFilter),
    [silsilaIndex, voters, originals, edits, genderFilter]
  );

  const issueRows = useMemo(
    () =>
      voters.filter(
        (voter) => rowFieldIssues(voter._id, originals, edits, validation.issueContextBase).length > 0
      ),
    [voters, originals, edits, validation.issueContextBase]
  );

  const pendingUpdates = useMemo(() => buildSaveUpdates(originals, edits), [originals, edits]);

  const displayRows = useMemo(() => {
    if (stage === 'edit') {
      return issueRows.length > 0 ? issueRows : voters;
    }
    if (stage === 'review') {
      const changedIds = new Set(pendingUpdates.map((update) => update.id));
      return voters.filter((voter) => changedIds.has(voter._id));
    }
    return voters;
  }, [stage, issueRows, voters, pendingUpdates]);

  const loadBatch = useCallback(
    async (page: number, gender: AiFixGender) => {
      setIsLoading(true);
      setLoadError(null);
      setSavedBatch(false);
      setEdits({});
      setStage('identify');

      try {
        const [batchData, indexData] = await Promise.all([
          loadAiFixBatchVoters(blockCode, halkaName, page, gender),
          fetchBlockSilsilaIndex(blockCode, halkaName),
        ]);

        setVoters(batchData.voters);
        setOriginals(buildOriginalsMap(batchData.voters, columnSettings));
        setSilsilaIndex(indexData.entries);
        setBatchPage(batchData.currentPage);
        setTotalPages(batchData.totalPages);
        setTotalVoters(batchData.total);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'Failed to load batch');
        setVoters([]);
        setOriginals({});
      } finally {
        setIsLoading(false);
      }
    },
    [blockCode, halkaName, columnSettings]
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

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
  }, [isOpen, halkaName]);

  useEffect(() => {
    if (!isOpen || !blockCode) {
      return;
    }

    const startPage = readNextBatchPage(halkaName, blockCode, genderFilter);
    void loadBatch(startPage, genderFilter);
  }, [isOpen, blockCode, halkaName, genderFilter, loadBatch]);

  const handleGenderChange = (nextGender: AiFixGender) => {
    if (nextGender === genderFilter || isLoading || isAiFixing || isSaving) {
      return;
    }

    if (Object.keys(edits).length > 0) {
      toast.error('Save or discard changes before switching gender');
      return;
    }

    setGenderFilter(nextGender);
  };

  const handleClose = () => {
    if (isAiFixing || isSaving) {
      return;
    }
    onClose();
  };

  const handleCellEdit = (rowId: string, field: AiFixEditableField, value: string) => {
    setEdits((current) => {
      const next = { ...current };
      const rowEdits = { ...(next[rowId] ?? {}) };
      const originalValue = originals[rowId]?.[field] ?? '';

      if (value === originalValue) {
        delete rowEdits[field];
      } else {
        rowEdits[field] = value;
      }

      if (Object.keys(rowEdits).length === 0) {
        delete next[rowId];
      } else {
        next[rowId] = rowEdits;
      }

      return next;
    });
  };

  const handleAiFix = async () => {
    if (isAiFixing || isSaving) {
      return;
    }

    const items = buildAiFixItems(voters, originals, edits, validation);
    if (items.length === 0) {
      toast('No issues left to fix with AI in this batch');
      return;
    }

    setIsAiFixing(true);
    try {
      const { results, message } = await requestSpreadsheetAiFix(items);
      let applied = 0;
      let failed = 0;

      setEdits((current) => {
        const next = { ...current };

        for (const result of results) {
          if (result.error) {
            failed += 1;
            continue;
          }

          const rowEdits = { ...(next[result.id] ?? {}) };
          let changed = false;

          for (const field of AI_FIX_EDITABLE_FIELDS) {
            const aiValue = result[field];
            if (aiValue == null || aiValue === '') {
              continue;
            }

            const originalValue = originals[result.id]?.[field] ?? '';
            if (aiValue === originalValue) {
              delete rowEdits[field];
            } else {
              rowEdits[field] = aiValue;
              changed = true;
            }
          }

          if (Object.keys(rowEdits).length === 0) {
            delete next[result.id];
          } else if (changed) {
            next[result.id] = rowEdits;
            applied += 1;
          }
        }

        return next;
      });

      if (message) {
        toast(message);
      } else if (applied > 0) {
        toast.success(`AI updated ${applied} row(s)${failed > 0 ? ` (${failed} failed)` : ''}`);
      } else if (failed > 0) {
        toast.error(`AI fix failed for ${failed} row(s)`);
      } else {
        toast('AI found no changes');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'AI fix failed');
    } finally {
      setIsAiFixing(false);
    }
  };

  const handleSave = async () => {
    if (isSaving || pendingUpdates.length === 0) {
      return;
    }

    setIsSaving(true);
    try {
      const result = await saveVoterBatch({ updates: pendingUpdates, deletes: [] });
      toast.success(`Saved ${result.updated} voter(s)`);
      setSavedBatch(true);

      const nextPage = batchPage + 1;
      writeNextBatchPage(halkaName, blockCode, genderFilter, nextPage);
      onSaved?.();

      setEdits({});
      setOriginals((current) => {
        const next = { ...current };
        for (const update of pendingUpdates) {
          next[update.id] = {
            silsilaNo: update.silsilaNo ?? current[update.id]?.silsilaNo ?? '',
            age: update.age ?? current[update.id]?.age ?? '',
          };
        }
        return next;
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  const handleNextBatch = () => {
    const nextPage = batchPage + 1;
    writeNextBatchPage(halkaName, blockCode, genderFilter, nextPage);

    if (nextPage > totalPages) {
      toast(`All ${genderFilter} voters in this block have been processed`);
      handleClose();
      return;
    }
    void loadBatch(nextPage, genderFilter);
  };

  const batchRangeLabel = useMemo(() => {
    if (voters.length === 0) {
      return '';
    }
    const start = (batchPage - 1) * AI_FIX_BATCH_SIZE + 1;
    const end = start + voters.length - 1;
    const genderLabel = genderFilter === 'male' ? 'Male' : 'Female';
    return `${genderLabel} voters ${start.toLocaleString()}–${end.toLocaleString()} of ${totalVoters.toLocaleString()}`;
  }, [batchPage, voters.length, totalVoters, genderFilter]);

  const hasMoreBatches = batchPage < totalPages;

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/40" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
                <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4">
                  <div>
                    <Dialog.Title className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                      <SparklesIcon className="h-5 w-5 text-amber-500" />
                      AI Fix — Block {blockCode}
                    </Dialog.Title>
                    <p className="mt-1 text-sm text-gray-500">
                      {batchRangeLabel || 'Loading batch…'} · {AI_FIX_BATCH_SIZE} per gender per batch
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={isAiFixing || isSaving}
                    className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>

                <div className="flex items-center gap-2 border-b border-gray-200 px-6 py-3">
                  {GENDER_TABS.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => handleGenderChange(tab.id)}
                      disabled={isLoading || isAiFixing || isSaving}
                      className={`rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                        genderFilter === tab.id
                          ? tab.id === 'male'
                            ? 'bg-blue-100 text-blue-900 ring-1 ring-inset ring-blue-300'
                            : 'bg-pink-100 text-pink-900 ring-1 ring-inset ring-pink-300'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="border-b border-gray-200 px-6 py-3">
                  <ol className="flex items-center gap-2 text-sm">
                    {STAGE_STEPS.map((step, index) => {
                      const current = stageIndex(stage);
                      const isActive = index === current;
                      const isDone = index < current;

                      return (
                        <li key={step.id} className="flex items-center gap-2">
                          {index > 0 ? <ChevronRightIcon className="h-4 w-4 text-gray-300" /> : null}
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium ${
                              isActive
                                ? 'bg-amber-100 text-amber-900'
                                : isDone
                                  ? 'bg-green-50 text-green-800'
                                  : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            {isDone ? <CheckIcon className="h-4 w-4" /> : null}
                            {index + 1}. {step.label}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                </div>

                <SilsilaGapNotice
                  blockReport={validation.gapBlockReport}
                  pageReports={validation.gapPageReports}
                />

                {loadError ? (
                  <div className="px-6 py-8 text-center text-sm text-red-600">{loadError}</div>
                ) : (
                  <div className="min-h-0 flex-1 overflow-auto">
                    {isLoading ? (
                      <div className="flex items-center justify-center py-16 text-sm text-gray-500">
                        Loading voters…
                      </div>
                    ) : stage === 'review' ? (
                      <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="sticky top-0 bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left font-medium text-gray-600">CNIC</th>
                            <th className="px-4 py-3 text-left font-medium text-gray-600">Field</th>
                            <th className="px-4 py-3 text-left font-medium text-gray-600">Before</th>
                            <th className="px-4 py-3 text-left font-medium text-gray-600">After</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                          {displayRows.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                                No changes to review. Go back to edit or proceed to the next batch.
                              </td>
                            </tr>
                          ) : (
                            displayRows.flatMap((voter) => {
                              const update = pendingUpdates.find((item) => item.id === voter._id);
                              if (!update) {
                                return [];
                              }

                              return AI_FIX_EDITABLE_FIELDS.filter(
                                (field) => update[field] !== undefined
                              ).map((field) => (
                                <tr key={`${voter._id}-${field}`} className="bg-green-50/40">
                                  <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-gray-700">
                                    {voter.cnic || '—'}
                                  </td>
                                  <td className="px-4 py-2 capitalize text-gray-600">
                                    {field === 'silsilaNo' ? 'Silsila' : 'Age'}
                                  </td>
                                  <td className="px-4 py-2 text-gray-500">
                                    {originals[voter._id]?.[field] || '—'}
                                  </td>
                                  <td className="px-4 py-2 font-medium text-green-800">
                                    {update[field] || '—'}
                                  </td>
                                </tr>
                              ));
                            })
                          )}
                        </tbody>
                      </table>
                    ) : (
                      <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="sticky top-0 bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left font-medium text-gray-600">#</th>
                            <th className="px-4 py-3 text-left font-medium text-gray-600">CNIC</th>
                            <th className="px-4 py-3 text-left font-medium text-gray-600">Silsila</th>
                            <th className="px-4 py-3 text-left font-medium text-gray-600">Age</th>
                            <th className="px-4 py-3 text-left font-medium text-gray-600">Issues</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                          {displayRows.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                                {stage === 'identify'
                                  ? 'No voters in this batch.'
                                  : 'No issue rows in this batch.'}
                              </td>
                            </tr>
                          ) : (
                            displayRows.map((voter, index) => {
                              const fields = mergeRowFields(originals, edits, voter._id);
                              const issues = rowFieldIssues(
                                voter._id,
                                originals,
                                edits,
                                validation.issueContextBase
                              );
                              const hasIssues = issues.length > 0;
                              const silsilaIssue = hasSilsilaColumnIssue(issues);
                              const ageIssue = issues.includes('age');

                              return (
                                <tr
                                  key={voter._id}
                                  className={hasIssues ? 'bg-amber-50/70' : undefined}
                                >
                                  <td className="whitespace-nowrap px-4 py-2 text-gray-500">
                                    {index + 1}
                                  </td>
                                  <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-gray-700">
                                    {voter.cnic || '—'}
                                  </td>
                                  <td className="px-4 py-2">
                                    {stage === 'edit' ? (
                                      <input
                                        type="text"
                                        value={fields.silsilaNo}
                                        onChange={(event) =>
                                          handleCellEdit(voter._id, 'silsilaNo', event.target.value)
                                        }
                                        className={`w-24 rounded border border-gray-300 px-2 py-1 text-sm ${issueCellClass(silsilaIssue)}`}
                                      />
                                    ) : (
                                      <span className={issueCellClass(silsilaIssue)}>{fields.silsilaNo || '—'}</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-2">
                                    {stage === 'edit' ? (
                                      <input
                                        type="text"
                                        value={fields.age}
                                        onChange={(event) =>
                                          handleCellEdit(voter._id, 'age', event.target.value)
                                        }
                                        className={`w-16 rounded border border-gray-300 px-2 py-1 text-sm ${issueCellClass(ageIssue)}`}
                                      />
                                    ) : (
                                      <span className={issueCellClass(ageIssue)}>{fields.age || '—'}</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-2 text-xs text-amber-800">
                                    {hasIssues ? issueSummaryLabel(issues) : '—'}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-6 py-4">
                  <div className="text-sm text-gray-600">
                    {isLoading
                      ? '…'
                      : stage === 'identify'
                        ? `${issueRows.length} issue row(s) in this batch`
                        : stage === 'edit'
                          ? `${pendingUpdates.length} pending change(s)`
                          : `${pendingUpdates.length} change(s) ready to save`}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {stage === 'identify' ? (
                      <>
                        {hasMoreBatches ? (
                          <button
                            type="button"
                            onClick={handleNextBatch}
                            disabled={isLoading}
                            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                          >
                            Skip to next {AI_FIX_BATCH_SIZE} {genderFilter}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => setStage('edit')}
                          disabled={isLoading || voters.length === 0}
                          className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                        >
                          Continue to edit
                        </button>
                      </>
                    ) : null}

                    {stage === 'edit' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setStage('identify')}
                          disabled={isAiFixing || isSaving}
                          className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          Back
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleAiFix()}
                          disabled={isAiFixing || isSaving || issueRows.length === 0}
                          className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                        >
                          <SparklesIcon className="h-4 w-4" />
                          {isAiFixing ? 'Fixing…' : 'Fix with AI'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setStage('review')}
                          disabled={isAiFixing || isSaving}
                          className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                        >
                          Review changes
                        </button>
                      </>
                    ) : null}

                    {stage === 'review' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setStage('edit')}
                          disabled={isSaving}
                          className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          Back
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleSave()}
                          disabled={isSaving || pendingUpdates.length === 0}
                          className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          {isSaving ? 'Saving…' : `Save ${pendingUpdates.length} change(s)`}
                        </button>
                        {savedBatch && hasMoreBatches ? (
                          <button
                            type="button"
                            onClick={handleNextBatch}
                            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                          >
                            Next {AI_FIX_BATCH_SIZE} {genderFilter} voters
                          </button>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
