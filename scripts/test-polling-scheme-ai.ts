import {
  applyStationInheritance,
  buildExactDuplicateKey,
  buildRowFingerprint,
  normalizeExtractedRow,
  validateExtractedPage,
} from '@/lib/polling-scheme/ai-validation';
import type { PollingSchemeAiPageExtraction } from '@/lib/polling-scheme/ai-job-types';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function runValidationTests(): void {
  const extraction: PollingSchemeAiPageExtraction = {
    page: 1,
    district: 'لاہور',
    warnings: [],
    confidence: 0.9,
    stationContext: null,
    rows: [
      {
        slNo: '1',
        pollingStation: 'Govt School (Male)',
        areaType: 'Ward/Mohalla/Street',
        areaName: 'وارڈ نمبر 5',
        electoralRollCode: '123456',
        maleVoters: 100,
        femaleVoters: 0,
        totalVoters: 100,
        maleBooths: '1',
        femaleBooths: '',
        totalBooths: '1',
        rowType: 'Detail',
        stationType: 'male',
        sourceRawText: 'raw',
        confidence: 0.9,
        warnings: [],
      },
      {
        slNo: '1',
        pollingStation: 'Govt School (Male)',
        areaType: '',
        areaName: '',
        electoralRollCode: '',
        maleVoters: 100,
        femaleVoters: 0,
        totalVoters: 100,
        maleBooths: '1',
        femaleBooths: '',
        totalBooths: '1',
        rowType: 'Station Total',
        stationType: 'male',
        sourceRawText: 'total',
        confidence: 0.9,
        warnings: [],
      },
    ],
  };

  const issues = validateExtractedPage(extraction);
  assert(issues.every((issue) => issue.level !== 'error'), 'Expected no validation errors');

  const normalized = extraction.rows.map((row) =>
    normalizeExtractedRow(row, extraction.page, extraction.district)
  );
  assert(normalized[0].areaName.includes('وارڈ'), 'Urdu text should be preserved');
  assert(normalized[0].electoralRollCode === '123456', 'Block code normalization failed');

  const inherited = applyStationInheritance(
    [
      {
        ...normalized[0],
        pollingStation: '',
        slNo: '',
      },
    ],
    {
      slNo: '9',
      pollingStation: 'Carried Station',
      stationType: 'combined',
      district: 'Lahore',
    }
  );
  assert(inherited[0].pollingStation === 'Carried Station', 'Station inheritance failed');

  const fingerprint = buildRowFingerprint('PP23', normalized[0], 'male');
  assert(fingerprint.startsWith('PP23|'), 'Fingerprint should include halka');

  const exactKey = buildExactDuplicateKey('job1', 1, 'hash', normalized[0], 'male');
  assert(exactKey.includes('job1'), 'Exact duplicate key should include job id');
}

runValidationTests();
console.log('polling-scheme AI validation tests passed');
