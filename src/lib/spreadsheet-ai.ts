import type { SpreadsheetFieldIssue } from '@/lib/spreadsheet-field-validation';

export interface SpreadsheetAiFixItem {
  id: string;
  currentSilsilaNo?: string;
  currentAge?: string;
  issues?: SpreadsheetFieldIssue[];
  neighborBeforeSilsila?: string;
  neighborAfterSilsila?: string;
  duplicateSilsilaInBlock?: string[];
}

export interface SpreadsheetAiFixResult {
  id: string;
  silsilaNo?: string;
  age?: string;
  confidence?: string;
  error?: string;
}

export interface SpreadsheetAiFixResponse {
  results: SpreadsheetAiFixResult[];
  message?: string;
}

export async function requestSpreadsheetAiFix(
  fixes: SpreadsheetAiFixItem[]
): Promise<SpreadsheetAiFixResponse> {
  const response = await fetch('/api/voters/spreadsheet/ai-fix/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fixes }),
  });

  const data = (await response.json().catch(() => ({}))) as SpreadsheetAiFixResponse & { error?: string };

  if (!response.ok) {
    throw new Error(data.error || 'AI fix request failed');
  }

  return data;
}

export async function fetchBlockSilsilaIndex(
  blockCode: string,
  halkaName: string
): Promise<{ entries: import('@/lib/spreadsheet-silsila-validation').SilsilaIndexEntry[]; total: number }> {
  const params = new URLSearchParams({ blockCode, halkaName });
  const response = await fetch(`/api/voters/silsila-index/?${params.toString()}`);

  const data = (await response.json().catch(() => ({}))) as {
    entries?: import('@/lib/spreadsheet-silsila-validation').SilsilaIndexEntry[];
    total?: number;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(data.error || 'Failed to load silsila index');
  }

  return {
    entries: data.entries ?? [],
    total: data.total ?? 0,
  };
}
