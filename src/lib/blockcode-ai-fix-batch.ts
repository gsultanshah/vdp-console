import type { ConstituencyTableColumnSettings } from '@/lib/table-column-settings';
import type { PaginatedVotersResponse, VoterBrowseRecord } from '@/lib/voter-browse-types';
import { genderFromCnic } from '@/lib/cnic';
import {
  buildBatchUpdates,
  pickSpreadsheetFields,
  type SpreadsheetField,
} from '@/lib/voter-batch';
import {
  getSpreadsheetFieldIssues,
  hasSilsilaColumnIssue,
  silsilaDuplicateKey,
  type SpreadsheetFieldIssue,
  type SpreadsheetIssueContext,
} from '@/lib/spreadsheet-field-validation';
import {
  analyzeBlockSilsilaGaps,
  analyzeSilsilaGapsByPage,
  type SilsilaGapReport,
} from '@/lib/spreadsheet-silsila-gaps';
import {
  buildGenderSilsilaUsageMap,
  detectOrderIssueVoterIds,
  findDuplicateVoterIdsFromUsage,
  getNeighborSilsilaNumbers,
  mergeSilsilaIndexWithEdits,
  type SilsilaIndexEntry,
} from '@/lib/spreadsheet-silsila-validation';
import type { SpreadsheetAiFixItem } from '@/lib/spreadsheet-ai';

export const AI_FIX_BATCH_SIZE = 100;

export type AiFixGender = 'male' | 'female';

export const AI_FIX_EDITABLE_FIELDS = ['silsilaNo', 'age'] as const;
export type AiFixEditableField = (typeof AI_FIX_EDITABLE_FIELDS)[number];

export function filterSilsilaIndexByGender(
  entries: SilsilaIndexEntry[],
  gender: AiFixGender
): SilsilaIndexEntry[] {
  return entries.filter((entry) => genderFromCnic(entry.cnic ?? '') === gender);
}

export async function loadAiFixBatchVoters(
  blockCode: string,
  halkaName: string,
  page: number,
  gender: AiFixGender
): Promise<PaginatedVotersResponse> {
  const params = new URLSearchParams({
    blockCode,
    halkaName,
    page: String(page),
    limit: String(AI_FIX_BATCH_SIZE),
    spreadsheet: 'true',
    sortBy: 'silsilaNo',
    sortOrder: 'asc',
    gender,
  });

  const response = await fetch(`/api/voters/?${params.toString()}`);
  if (!response.ok) {
    throw new Error('Failed to load voters for AI fix batch');
  }

  return (await response.json()) as PaginatedVotersResponse;
}

export function buildOriginalsMap(
  voters: VoterBrowseRecord[],
  columnSettings?: ConstituencyTableColumnSettings | null
): Record<string, Record<AiFixEditableField, string>> {
  const map: Record<string, Record<AiFixEditableField, string>> = {};
  for (const voter of voters) {
    const fields = pickSpreadsheetFields(voter, columnSettings);
    map[voter._id] = {
      silsilaNo: fields.silsilaNo,
      age: fields.age,
    };
  }
  return map;
}

export function mergeRowFields(
  originals: Record<string, Record<AiFixEditableField, string>>,
  edits: Record<string, Partial<Record<AiFixEditableField, string>>>,
  rowId: string
): Record<AiFixEditableField, string> {
  const original = originals[rowId] ?? { silsilaNo: '', age: '' };
  return {
    silsilaNo: edits[rowId]?.silsilaNo ?? original.silsilaNo,
    age: edits[rowId]?.age ?? original.age,
  };
}

export function buildSilsilaOverridesForBatch(
  voters: VoterBrowseRecord[],
  originals: Record<string, Record<AiFixEditableField, string>>,
  edits: Record<string, Partial<Record<AiFixEditableField, string>>>
): Map<string, string> {
  const overrides = new Map<string, string>();
  for (const voter of voters) {
    overrides.set(voter._id, mergeRowFields(originals, edits, voter._id).silsilaNo);
  }
  return overrides;
}

export interface BatchValidationState {
  duplicateVoterIds: Set<string>;
  orderIssueVoterIds: Set<string>;
  effectiveSilsilaEntries: SilsilaIndexEntry[];
  issueContextBase: Omit<SpreadsheetIssueContext, 'voterId'>;
  gapBlockReport: SilsilaGapReport | null;
  gapPageReports: SilsilaGapReport[];
}

export function buildBatchValidationState(
  silsilaIndex: SilsilaIndexEntry[],
  voters: VoterBrowseRecord[],
  originals: Record<string, Record<AiFixEditableField, string>>,
  edits: Record<string, Partial<Record<AiFixEditableField, string>>>,
  gender: AiFixGender
): BatchValidationState {
  const silsilaOverrides = buildSilsilaOverridesForBatch(voters, originals, edits);
  const effectiveSilsilaEntries = mergeSilsilaIndexWithEdits(silsilaIndex, silsilaOverrides);
  const genderFilteredEntries = filterSilsilaIndexByGender(effectiveSilsilaEntries, gender);
  const usage = buildGenderSilsilaUsageMap(effectiveSilsilaEntries);
  const duplicateVoterIds = findDuplicateVoterIdsFromUsage(usage);
  const orderIssueVoterIds = detectOrderIssueVoterIds(genderFilteredEntries);

  const issueContextBase: Omit<SpreadsheetIssueContext, 'voterId'> = {
    duplicateVoterIds,
    orderIssueVoterIds,
  };

  const blockScopeLabel =
    gender === 'male' ? 'Male voters in block' : 'Female voters in block';

  return {
    duplicateVoterIds,
    orderIssueVoterIds,
    effectiveSilsilaEntries: genderFilteredEntries,
    issueContextBase,
    gapBlockReport: analyzeBlockSilsilaGaps(genderFilteredEntries, blockScopeLabel),
    gapPageReports: analyzeSilsilaGapsByPage(genderFilteredEntries),
  };
}

export function rowFieldIssues(
  rowId: string,
  originals: Record<string, Record<AiFixEditableField, string>>,
  edits: Record<string, Partial<Record<AiFixEditableField, string>>>,
  issueContextBase: Omit<SpreadsheetIssueContext, 'voterId'>
): SpreadsheetFieldIssue[] {
  const fields = mergeRowFields(originals, edits, rowId);
  return getSpreadsheetFieldIssues(
    { silsilaNo: fields.silsilaNo, age: fields.age },
    { ...issueContextBase, voterId: rowId }
  );
}

export function buildAiFixItems(
  voters: VoterBrowseRecord[],
  originals: Record<string, Record<AiFixEditableField, string>>,
  edits: Record<string, Partial<Record<AiFixEditableField, string>>>,
  validation: BatchValidationState
): SpreadsheetAiFixItem[] {
  return voters
    .filter((voter) => rowFieldIssues(voter._id, originals, edits, validation.issueContextBase).length > 0)
    .map((voter) => {
      const fields = mergeRowFields(originals, edits, voter._id);
      const issues = rowFieldIssues(voter._id, originals, edits, validation.issueContextBase);
      const neighbors = getNeighborSilsilaNumbers(validation.effectiveSilsilaEntries, voter._id);
      const silsila = silsilaDuplicateKey(fields.silsilaNo);

      return {
        id: voter._id,
        currentSilsilaNo: fields.silsilaNo,
        currentAge: fields.age,
        issues,
        neighborBeforeSilsila: neighbors.before,
        neighborAfterSilsila: neighbors.after,
        duplicateSilsilaInBlock: issues.includes('duplicate') && silsila ? [silsila] : undefined,
      };
    });
}

export function buildSaveUpdates(
  originals: Record<string, Record<AiFixEditableField, string>>,
  edits: Record<string, Partial<Record<AiFixEditableField, string>>>
) {
  const fullOriginals = Object.fromEntries(
    Object.entries(originals).map(([id, fields]) => [
      id,
      {
        silsilaNo: fields.silsilaNo,
        blockCode: '',
        gharanaNo: '',
        fatherName: '',
        cnic: '',
        profession: '',
        age: fields.age,
        address: '',
      } satisfies Record<SpreadsheetField, string>,
    ])
  );

  const fullEdits = Object.fromEntries(
    Object.entries(edits).map(([id, rowEdits]) => [
      id,
      Object.fromEntries(
        Object.entries(rowEdits).filter(([, value]) => value !== undefined)
      ) as Partial<Record<SpreadsheetField, string>>,
    ])
  );

  return buildBatchUpdates(fullOriginals, fullEdits);
}

export function issueSummaryLabel(issues: SpreadsheetFieldIssue[]): string {
  const labels: Record<SpreadsheetFieldIssue, string> = {
    silsila: 'Bad serial',
    duplicate: 'Duplicate',
    order: 'Order',
    age: 'Age',
  };
  return issues.map((issue) => labels[issue]).join(', ');
}

export { hasSilsilaColumnIssue };
