import { createOpenAiClient } from '@/lib/openai-client';
import type {
  PollingSchemeAiPageExtraction,
  PollingSchemeAiStationContext,
} from '@/lib/polling-scheme/ai-job-types';
import type { PollingSchemeRowType, PollingStationGenderType } from '@/lib/polling-scheme/types';

const EXTRACTION_MODEL = process.env.OPENAI_POLLING_SCHEME_MODEL || 'gpt-4o-mini';

const EXTRACTION_PROMPT = `You extract structured polling scheme data from a scanned Pakistani electoral polling scheme page.

The table may contain Urdu and English text. Preserve Urdu text exactly in UTF-8 (do not transliterate).

Handle:
- Merged cells and multi-line station names
- Male-only, female-only, and combined polling stations (often marked Male/Female in station name)
- Station total rows and page total rows
- Ward/Mohalla/Street or village rows with 6+ digit electoral roll block codes
- Stations continuing from the previous page (use prior station context when the current page starts mid-station)
- Booth counts (male_booth, female_booth, total_booth) when present

Row types:
- Detail: ward/mohalla/village row with block code and voter counts
- Station Total: subtotal for the current polling station
- Page Total: page-level total row
- Unknown: anything else

Return JSON:
{
  "page": number,
  "district": string,
  "rows": [
    {
      "slNo": string,
      "pollingStation": string,
      "areaType": string,
      "areaName": string,
      "electoralRollCode": string,
      "maleVoters": number,
      "femaleVoters": number,
      "totalVoters": number,
      "maleBooths": string,
      "femaleBooths": string,
      "totalBooths": string,
      "rowType": "Detail" | "Station Total" | "Page Total" | "Unknown",
      "stationType": "male" | "female" | "combined",
      "sourceRawText": string,
      "confidence": number,
      "warnings": string[]
    }
  ],
  "stationContext": {
    "slNo": string,
    "pollingStation": string,
    "stationType": "male" | "female" | "combined",
    "district": string
  } | null,
  "warnings": string[],
  "confidence": number
}

Rules:
- Use empty strings for missing text fields, 0 for missing numeric voter counts.
- Block codes must be numeric strings without spaces.
- confidence is 0-1 for the whole page.
- stationContext should reflect the last open polling station at the end of this page for continuation on the next page.`;


function asRowType(value: unknown): PollingSchemeRowType {
  const raw = String(value ?? 'Unknown');
  if (raw === 'Detail' || raw === 'Station Total' || raw === 'Page Total') {
    return raw;
  }
  return 'Unknown';
}

function asStationType(value: unknown): PollingStationGenderType {
  const raw = String(value ?? 'combined').toLowerCase();
  if (raw === 'male' || raw === 'female') {
    return raw;
  }
  return 'combined';
}

function parseStationContext(value: unknown): PollingSchemeAiStationContext | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const item = value as Record<string, unknown>;
  const pollingStation = String(item.pollingStation ?? '').trim();
  if (!pollingStation) {
    return null;
  }
  return {
    slNo: String(item.slNo ?? ''),
    pollingStation,
    stationType: asStationType(item.stationType),
    district: String(item.district ?? ''),
  };
}

function parseExtraction(content: string, page: number): PollingSchemeAiPageExtraction {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('OpenAI returned invalid JSON');
  }

  const root = parsed as Record<string, unknown>;
  const rowsRaw = Array.isArray(root.rows) ? root.rows : [];

  const rows = rowsRaw.map((row) => {
    const item = row as Record<string, unknown>;
    return {
      slNo: String(item.slNo ?? ''),
      pollingStation: String(item.pollingStation ?? ''),
      areaType: String(item.areaType ?? ''),
      areaName: String(item.areaName ?? ''),
      electoralRollCode: String(item.electoralRollCode ?? '').replace(/\s+/g, ''),
      maleVoters: Number(item.maleVoters ?? 0) || 0,
      femaleVoters: Number(item.femaleVoters ?? 0) || 0,
      totalVoters: Number(item.totalVoters ?? 0) || 0,
      maleBooths: String(item.maleBooths ?? ''),
      femaleBooths: String(item.femaleBooths ?? ''),
      totalBooths: String(item.totalBooths ?? ''),
      rowType: asRowType(item.rowType),
      stationType: asStationType(item.stationType),
      sourceRawText: String(item.sourceRawText ?? ''),
      confidence: Math.min(1, Math.max(0, Number(item.confidence ?? 0) || 0)),
      warnings: Array.isArray(item.warnings) ? item.warnings.map(String) : [],
    };
  });

  return {
    page: Number(root.page ?? page) || page,
    district: String(root.district ?? ''),
    rows,
    stationContext: parseStationContext(root.stationContext),
    warnings: Array.isArray(root.warnings) ? root.warnings.map(String) : [],
    confidence: Math.min(1, Math.max(0, Number(root.confidence ?? 0) || 0)),
  };
}

async function callExtractionModel(
  imageUrl: string,
  page: number,
  priorContext: PollingSchemeAiStationContext | null,
  verifyMode: boolean
): Promise<{ extraction: PollingSchemeAiPageExtraction; usage?: { inputTokens?: number; outputTokens?: number } }> {
  const client = createOpenAiClient(180_000);

  const contextNote = priorContext
    ? `Prior page ended with station: slNo=${priorContext.slNo}, name=${priorContext.pollingStation}, type=${priorContext.stationType}, district=${priorContext.district}. Rows at the top of this page may continue this station.`
    : 'No prior station context.';

  const prompt = verifyMode
    ? `${EXTRACTION_PROMPT}\n\nThis is a verification pass. Fix any OCR/layout mistakes while preserving Urdu text.\n${contextNote}\nPage number: ${page}`
    : `${EXTRACTION_PROMPT}\n\n${contextNote}\nPage number: ${page}`;

  const response = await client.responses.create({
    model: EXTRACTION_MODEL,
    ...(EXTRACTION_MODEL.includes('gpt-5')
      ? {
          reasoning: {
            effort: EXTRACTION_MODEL.includes('mini') ? ('medium' as const) : ('high' as const),
          },
        }
      : {}),
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: prompt },
          { type: 'input_image', image_url: imageUrl, detail: 'high' },
        ],
      },
    ],
    text: {
      format: { type: 'json_object' },
    },
  });

  if (response.error) {
    throw new Error(response.error.message || 'OpenAI extraction failed');
  }

  const content = response.output_text?.trim();
  if (!content) {
    throw new Error('OpenAI returned an empty extraction response');
  }

  const usage = response.usage
    ? {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      }
    : undefined;

  return { extraction: parseExtraction(content, page), usage };
}

export async function extractPollingSchemePage(
  imageUrl: string,
  page: number,
  priorContext: PollingSchemeAiStationContext | null,
  options?: { forceVerify?: boolean }
): Promise<{
  extraction: PollingSchemeAiPageExtraction;
  verified: boolean;
  usage?: { inputTokens?: number; outputTokens?: number };
}> {
  const first = await callExtractionModel(imageUrl, page, priorContext, false);
  const needsVerify =
    options?.forceVerify ||
    first.extraction.confidence < 0.75 ||
    first.extraction.rows.length === 0 ||
    first.extraction.warnings.length > 0;

  if (!needsVerify) {
    return { extraction: first.extraction, verified: false, usage: first.usage };
  }

  const second = await callExtractionModel(imageUrl, page, priorContext, true);
  return {
    extraction: second.extraction,
    verified: true,
    usage: {
      inputTokens: (first.usage?.inputTokens ?? 0) + (second.usage?.inputTokens ?? 0),
      outputTokens: (first.usage?.outputTokens ?? 0) + (second.usage?.outputTokens ?? 0),
    },
  };
}

export function getPollingSchemeExtractionModel(): string {
  return EXTRACTION_MODEL;
}
