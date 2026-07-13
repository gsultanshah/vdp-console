import { createOpenAiClient } from '@/lib/openai-client';
import { buildCloudinaryRowCropUrl } from '@/lib/cloudinary-url';
import { resolveCloudinaryPublicIdServer } from '@/lib/cloudinary-server';
import {
  normalizeExtractedAge,
  normalizeExtractedSilsila,
  type SpreadsheetFieldIssue,
} from '@/lib/spreadsheet-field-validation';
import type { VoterReproductionData } from '@/lib/voter-document';

const SPREADSHEET_EXTRACTION_MODEL =
  process.env.OPENAI_SPREADSHEET_MODEL || process.env.OPENAI_COLUMN_MODEL || 'gpt-5.5';

const ROW_VERTICAL_PADDING_RATIO = 0.18;

const BASE_EXTRACTION_PROMPT = `You are reading a cropped page-cut scan of ONE voter row from a Pakistani Urdu electoral voter list.

The image is a horizontal band cut from the scanned page — read ONLY what is visible in this row scan.

Extract ONLY these fields:
- silsilaNo: serial/sequence number in the leftmost column (سلسلہ نمبر). Digits only — one number, no spaces, no repeated pairs like "22 22".
- age: voter age in years (عمر). Digits only (typically 18–99).

Important:
- Trust the row scan image over any database hint if they conflict.
- Silsila must be unique within each gender list (male and female are checked separately).
- Silsila numbers generally increase down the printed list on each page.

Return JSON with this exact shape:
{
  "silsilaNo": "123",
  "age": "45",
  "confidence": "high"
}

Use empty string for a field you cannot read. confidence is "high", "medium", or "low".`;

export interface SpreadsheetRowImageInput {
  imageUrl: string;
  rowContext?: string;
}

export interface SpreadsheetAiExtractionContext {
  currentSilsilaNo?: string;
  currentAge?: string;
  issues?: SpreadsheetFieldIssue[];
  neighborBeforeSilsila?: string;
  neighborAfterSilsila?: string;
  duplicateSilsilaInBlock?: string[];
}

export interface SpreadsheetAiExtraction {
  silsilaNo: string;
  age: string;
  confidence: 'high' | 'medium' | 'low' | '';
  error?: string;
}

function buildExtractionPrompt(context?: SpreadsheetAiExtractionContext): string {
  if (!context) {
    return BASE_EXTRACTION_PROMPT;
  }

  const hints: string[] = [];

  if (context.currentSilsilaNo) {
    hints.push(`Stored silsila in database: "${context.currentSilsilaNo}"`);
  }
  if (context.currentAge) {
    hints.push(`Stored age in database: "${context.currentAge}"`);
  }
  if (context.issues?.length) {
    hints.push(`Known issues: ${context.issues.join(', ')}`);
  }
  if (context.neighborBeforeSilsila || context.neighborAfterSilsila) {
    hints.push(
      `Neighbour silsila on same page — before: ${context.neighborBeforeSilsila ?? '—'}, after: ${context.neighborAfterSilsila ?? '—'}`
    );
  }
  if (context.duplicateSilsilaInBlock?.length) {
    hints.push(
      `This silsila number is duplicated within the same gender list (male or female) in this block: ${context.duplicateSilsilaInBlock.join(', ')}`
    );
  }

  if (!hints.length) {
    return BASE_EXTRACTION_PROMPT;
  }

  return `${BASE_EXTRACTION_PROMPT}

Database hints (may be wrong — prefer the row scan):
${hints.map((line) => `- ${line}`).join('\n')}`;
}

export async function buildSpreadsheetRowImageInput(voter: {
  imageUrl?: string | null;
  rowY?: number | null;
  rowHeight?: number | null;
  reproduction?: VoterReproductionData | null;
}): Promise<SpreadsheetRowImageInput | null> {
  const imageUrl = voter.imageUrl?.trim();
  if (!imageUrl) {
    return null;
  }

  const rowY = voter.reproduction?.band?.y ?? voter.rowY ?? null;
  const rowHeight = voter.reproduction?.band?.height ?? voter.rowHeight ?? null;
  const pageHeight = voter.reproduction?.pageHeight ?? 3505;

  if (rowY != null && rowHeight != null) {
    const padding = Math.round(rowHeight * ROW_VERTICAL_PADDING_RATIO);
    const cropY = Math.max(0, Math.round(rowY - padding));
    const cropHeight = Math.round(rowHeight + padding * 2);

    try {
      const publicId = await resolveCloudinaryPublicIdServer(imageUrl);
      return {
        imageUrl: buildCloudinaryRowCropUrl(publicId, cropY, cropHeight),
        rowContext: 'The image is a tight page-cut crop of one voter row from the scanned list.',
      };
    } catch {
      const topPct = ((cropY / pageHeight) * 100).toFixed(1);
      const heightPct = ((cropHeight / pageHeight) * 100).toFixed(1);
      return {
        imageUrl,
        rowContext: `Read only the voter row band at ${topPct}% from the top, height ${heightPct}% of the full page.`,
      };
    }
  }

  return {
    imageUrl,
    rowContext: 'Identify the single voter row in the image and read its silsila and age columns.',
  };
}

function parseExtractionResponse(content: string): SpreadsheetAiExtraction {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('OpenAI returned invalid JSON');
  }

  const payload = parsed as Record<string, unknown>;
  const confidenceRaw = String(payload.confidence ?? '').toLowerCase();
  const confidence =
    confidenceRaw === 'high' || confidenceRaw === 'medium' || confidenceRaw === 'low'
      ? confidenceRaw
      : '';

  return {
    silsilaNo: normalizeExtractedSilsila(String(payload.silsilaNo ?? '')),
    age: normalizeExtractedAge(String(payload.age ?? '')),
    confidence,
  };
}

export async function extractSpreadsheetFieldsFromRowImage(
  input: SpreadsheetRowImageInput,
  context?: SpreadsheetAiExtractionContext
): Promise<SpreadsheetAiExtraction> {
  const client = createOpenAiClient();
  const prompt = buildExtractionPrompt(context);
  const fullPrompt = input.rowContext ? `${prompt}\n\n${input.rowContext}` : prompt;

  const response = await client.responses.create({
    model: SPREADSHEET_EXTRACTION_MODEL,
    reasoning: { effort: 'medium' },
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: fullPrompt },
          { type: 'input_image', image_url: input.imageUrl, detail: 'high' },
        ],
      },
    ],
    text: {
      format: { type: 'json_object' },
    },
  });

  if (response.error) {
    throw new Error(response.error.message || 'OpenAI spreadsheet extraction failed');
  }

  const content = response.output_text?.trim();
  if (!content) {
    throw new Error('OpenAI returned an empty response');
  }

  return parseExtractionResponse(content);
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (!items.length) {
    return [];
  }

  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.min(Math.max(1, limit), items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}
