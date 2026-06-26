const TITLE_KEYWORDS: { pattern: RegExp; score: number }[] = [
  { pattern: /سرورق/, score: 50 },
  { pattern: /سرواق|سر\s*ورق/, score: 45 },
  { pattern: /حتمی.*فہرست|فہرست.*202\d/, score: 30 },
  { pattern: /ووٹرز?\s*کی\s*تفصیل/, score: 25 },
  { pattern: /کل\s*ووٹر/, score: 20 },
  { pattern: /انتخابی\s*علاق/, score: 15 },
  { pattern: /الیکشن\s*کمیشن/, score: 10 },
  { pattern: /حلقہ\s*نام/, score: 10 },
  { pattern: /ضلع|تحصیل/, score: 5 },
];

const FILENAME_TITLE_PATTERNS = [/title/i, /sarwaraq/i, /sar[-_]?waraq/i, /سرورق/];

export const MAX_TITLE_PAGES = 3;
export const TITLE_SCORE_THRESHOLD = 20;

export function scoreTitlePage(ocrText: string, fileName = ''): number {
  let score = 0;
  const text = ocrText.replace(/\s+/g, ' ');

  for (const { pattern, score: points } of TITLE_KEYWORDS) {
    if (pattern.test(text)) {
      score += points;
    }
  }

  if (/مرد/.test(text) && /(خواتین|عورت)/.test(text) && /کل/.test(text)) {
    score += 15;
  }

  const cnicMatches = text.match(/\d{5}[-\s]?\d{7}[-\s]?\d/g);
  if (cnicMatches) {
    score -= cnicMatches.length * 8;
  }

  const numericTokens = text.match(/\b\d{1,4}\b/g);
  if (numericTokens && numericTokens.length > 25) {
    score -= 20;
  }

  if (FILENAME_TITLE_PATTERNS.some((pattern) => pattern.test(fileName))) {
    score += 35;
  }

  return score;
}

export function pickTitlePageIds(
  scoredPages: { id: string; score: number }[],
  maxTitles = MAX_TITLE_PAGES,
  threshold = TITLE_SCORE_THRESHOLD
): string[] {
  return scoredPages
    .filter((page) => page.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxTitles)
    .map((page) => page.id);
}
