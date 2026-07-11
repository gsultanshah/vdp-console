import type { BillingActivityFilter, BillingPeriod, MoneyRange, UsageDailyPoint } from '@/lib/billing/types';

export const BILLING_PRICING = {
  dailyEstimate: { min: 17.93, max: 29.12 },
  voterProcess: { min: 0.0029, max: 0.0087 },
  bulkSession: { min: 3.723, max: 9.232 },
  infrastructure: { min: 79.146, max: 189.289 },
} as const;

export function midpoint(range: MoneyRange): number {
  return (range.min + range.max) / 2;
}

export function multiplyRange(range: MoneyRange, quantity: number): MoneyRange {
  return {
    min: Number((range.min * quantity).toFixed(4)),
    max: Number((range.max * quantity).toFixed(4)),
  };
}

export function addRanges(...ranges: MoneyRange[]): MoneyRange {
  return ranges.reduce(
    (acc, range) => ({
      min: Number((acc.min + range.min).toFixed(4)),
      max: Number((acc.max + range.max).toFixed(4)),
    }),
    { min: 0, max: 0 }
  );
}

export function formatUsdRange(range: MoneyRange, digits = 2): string {
  return `$${range.min.toFixed(digits)} – $${range.max.toFixed(digits)}`;
}

export function formatUsd(value: number, digits = 2): string {
  return `$${value.toFixed(digits)}`;
}

export function resolvePeriodRange(period: BillingPeriod, now = new Date()): { start: Date; end: Date } {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (period === 'week') {
    start.setDate(start.getDate() - 6);
    return { start, end };
  }

  if (period === 'month') {
    start.setDate(1);
    return { start, end };
  }

  if (period === 'year') {
    start.setMonth(0, 1);
    return { start, end };
  }

  start.setFullYear(start.getFullYear() - 2);
  return { start, end };
}

export function daysInRange(start: Date, end: Date): number {
  const ms = Math.max(1, end.getTime() - start.getTime());
  return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

export function infrastructureCostForPeriod(
  usageIndex: number,
  days: number,
  period: BillingPeriod
): MoneyRange {
  const periodScale =
    period === 'week' ? 0.18 : period === 'month' ? 0.55 : period === 'year' ? 1 : 0.75;
  const intensity = Math.min(1, usageIndex / 250_000);
  const dayFactor = Math.min(1, days / 30);

  const min =
    BILLING_PRICING.infrastructure.min * periodScale * (0.35 + intensity * 0.4) * dayFactor;
  const max =
    BILLING_PRICING.infrastructure.max * periodScale * (0.45 + intensity * 0.55) * dayFactor;

  return {
    min: Number(min.toFixed(3)),
    max: Number(max.toFixed(3)),
  };
}

export function dailyEstimateForPeriod(total: MoneyRange, days: number): MoneyRange {
  return {
    min: Number((total.min / days).toFixed(3)),
    max: Number((total.max / days).toFixed(3)),
  };
}

export function filterActivitiesByType<T extends { activity: BillingActivityFilter }>(
  rows: T[],
  activity: BillingActivityFilter
): T[] {
  if (activity === 'all') return rows;
  if (activity === 'voter_processing') {
    return rows.filter((row) =>
      ['voter_processing', 'exports', 'parchi', 'ocr'].includes(row.activity)
    );
  }
  if (activity === 'bulk_compilation') {
    return rows.filter((row) =>
      ['bulk_compilation', 'exports', 'parchi', 'phone_enrich'].includes(row.activity)
    );
  }
  return rows.filter((row) => row.activity === activity);
}

export function rollupDailySeries(points: UsageDailyPoint[]): UsageDailyPoint[] {
  const map = new Map<string, UsageDailyPoint>();
  for (const point of points) {
    const existing = map.get(point.date);
    if (!existing) {
      map.set(point.date, { ...point });
      continue;
    }
    existing.voterUnits += point.voterUnits;
    existing.bulkSessions += point.bulkSessions;
    existing.ocrPages += point.ocrPages;
    existing.cost = addRanges(existing.cost, point.cost);
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}
