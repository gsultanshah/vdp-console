import OpenAI from 'openai';
import type { TableColumnDefinition } from '@/lib/table-column-settings';
import { normalizeColumnDefinitions } from '@/lib/table-column-settings';

const COLUMN_DETECTION_MODEL = process.env.OPENAI_COLUMN_MODEL || 'gpt-5.5';

const DETECTION_PROMPT = `You are analyzing a scanned Pakistani Urdu electoral voter list page.

Identify every data column in the main voter table (ignore page title, logos, and footer text outside the table).

Return JSON with this exact shape:
{
  "columns": [
    {
      "id": "snake_case_id",
      "label": "English display name",
      "minXRatio": 0.0,
      "maxXRatio": 0.12
    }
  ]
}

Rules:
- Order columns left to right (minXRatio ascending).
- minXRatio and maxXRatio are fractions of the full image width (0 to 1).
- Adjacent columns should not overlap; together they should cover the table width.
- Prefer these ids when the column matches: silsila_no, name, father_name, cnic, profession, age, address, previous_address.
- For unrecognized columns use col_0, col_1, etc.
- Include Urdu header meaning in the English label when helpful (e.g. "Name (نام)").
- Measure column boundaries from the visible table grid and header text positions.`;

function getOpenAiClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OpenAI API key is not configured');
  }
  return new OpenAI({
    apiKey,
    timeout: 120_000,
  });
}

function parseDetectionResponse(content: string): TableColumnDefinition[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('OpenAI returned invalid JSON');
  }

  const columns = (parsed as { columns?: unknown }).columns;
  if (!Array.isArray(columns) || !columns.length) {
    throw new Error('OpenAI did not return any columns');
  }

  const mapped = columns.map((column, index) => {
    const item = column as Record<string, unknown>;
    return {
      id: String(item.id ?? `col_${index}`),
      label: String(item.label ?? `Column ${index + 1}`),
      minXRatio: Number(item.minXRatio ?? 0),
      maxXRatio: Number(item.maxXRatio ?? 0),
      index,
    };
  });

  return normalizeColumnDefinitions(mapped);
}

export async function detectTableColumnsFromImage(imageUrl: string): Promise<TableColumnDefinition[]> {
  const client = getOpenAiClient();

  const response = await client.responses.create({
    model: COLUMN_DETECTION_MODEL,
    reasoning: { effort: 'medium' },
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: DETECTION_PROMPT },
          { type: 'input_image', image_url: imageUrl, detail: 'high' },
        ],
      },
    ],
    text: {
      format: { type: 'json_object' },
    },
  });

  if (response.error) {
    throw new Error(response.error.message || 'OpenAI column detection failed');
  }

  const content = response.output_text?.trim();
  if (!content) {
    throw new Error('OpenAI returned an empty response');
  }

  return parseDetectionResponse(content);
}
