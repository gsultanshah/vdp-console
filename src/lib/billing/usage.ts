import fs from 'fs/promises';
import path from 'path';
import type { Db } from 'mongodb';
import { connectNativeMongoClient } from '@/lib/mongo-client';
import {
  addRanges,
  BILLING_PRICING,
  dailyEstimateForPeriod,
  daysInRange,
  filterActivitiesByType,
  infrastructureCostForPeriod,
  multiplyRange,
  resolvePeriodRange,
  rollupDailySeries,
} from '@/lib/billing/pricing';
import type {
  BillingActivityFilter,
  BillingPeriod,
  BillingUsageSummary,
  UsageActivityRow,
  UsageDailyPoint,
} from '@/lib/billing/types';

const EXPORT_JOBS = 'exportjobs';
const PARCHI_JOBS = 'voter_parchi_jobs';

function dateKey(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 10);
}

function inRange(value: Date | string | null | undefined, start: Date, end: Date): boolean {
  if (!value) return false;
  const date = value instanceof Date ? value : new Date(value);
  return date >= start && date <= end;
}

async function loadPhoneEnrichActivities(
  start: Date,
  end: Date
): Promise<{ rows: UsageActivityRow[]; sessions: number; outputRows: number }> {
  const root = path.join(process.cwd(), 'data', 'phone-enrich');
  const rows: UsageActivityRow[] = [];
  let sessions = 0;
  let outputRows = 0;

  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const metaPath = path.join(root, entry.name, 'meta.json');
      try {
        const raw = await fs.readFile(metaPath, 'utf8');
        const meta = JSON.parse(raw) as {
          status?: string;
          sourceFileName?: string;
          totalInputRows?: number;
          outputRowCount?: number;
          createdBy?: string;
          createdAt?: string;
          completedAt?: string | null;
        };
        const timestamp = meta.completedAt || meta.createdAt;
        if (!timestamp || !inRange(timestamp, start, end)) continue;
        if (meta.status !== 'completed') continue;

        sessions += 1;
        outputRows += Number(meta.outputRowCount) || 0;
        rows.push({
          id: `phone-${entry.name}`,
          activity: 'phone_enrich',
          sku: 'VDP-BULK-PHONE-ENRICH',
          resource: 'phone-enrich.batch',
          region: 'ap-south-1',
          quantity: 1,
          unit: 'session',
          unitCost: BILLING_PRICING.bulkSession,
          cost: BILLING_PRICING.bulkSession,
          timestamp: new Date(timestamp).toISOString(),
          operator: meta.createdBy,
          metadata: {
            inputRows: Number(meta.totalInputRows) || 0,
            outputRows: Number(meta.outputRowCount) || 0,
            file: meta.sourceFileName || '',
          },
        });
      } catch {
        // ignore invalid job dirs
      }
    }
  } catch {
    // no phone enrich directory yet
  }

  return { rows, sessions, outputRows };
}

export async function collectBillingUsage(
  period: BillingPeriod,
  activity: BillingActivityFilter,
  now = new Date()
): Promise<BillingUsageSummary> {
  const { start, end } = resolvePeriodRange(period, now);
  const days = daysInRange(start, end);

  const client = await connectNativeMongoClient();
  const db = client.db('vdp');

  try {
    const dateFilter = { $gte: start, $lte: end };
    const [exportDocs, parchiDocs, ocrCount, voterCount, phoneData] = await Promise.all([
      db
        .collection(EXPORT_JOBS)
        .find({ createdAt: dateFilter })
        .project({
          createdBy: 1,
          createdByName: 1,
          processedVoters: 1,
          totalVoters: 1,
          status: 1,
          createdAt: 1,
          completedAt: 1,
          halkaNames: 1,
        })
        .toArray(),
      db
        .collection(PARCHI_JOBS)
        .find({ createdAt: dateFilter })
        .project({
          createdBy: 1,
          createdByName: 1,
          processedVoters: 1,
          totalVoters: 1,
          status: 1,
          createdAt: 1,
          completedAt: 1,
          halkaName: 1,
        })
        .toArray(),
      db.collection('blockcodes').countDocuments({
        status: 'completed',
        processedAt: dateFilter,
      }),
      db.collection('voters').countDocuments({ createdAt: dateFilter }),
      loadPhoneEnrichActivities(start, end),
    ]);

    const activities: UsageActivityRow[] = [...phoneData.rows];
    const dailyMap = new Map<string, UsageDailyPoint>();

    const bumpDaily = (day: string, voterUnits: number, bulkSessions: number, ocrPages: number, cost: { min: number; max: number }) => {
      const existing = dailyMap.get(day) ?? {
        date: day,
        voterUnits: 0,
        bulkSessions: 0,
        ocrPages: 0,
        cost: { min: 0, max: 0 },
      };
      existing.voterUnits += voterUnits;
      existing.bulkSessions += bulkSessions;
      existing.ocrPages += ocrPages;
      existing.cost = addRanges(existing.cost, cost);
      dailyMap.set(day, existing);
    };

    let exportJobs = 0;
    let parchiJobs = 0;
    let votersFromExports = 0;
    let votersFromParchi = 0;
    let bulkSessions = phoneData.sessions;

    for (const doc of exportDocs) {
      const voters = Number(doc.processedVoters) || 0;
      votersFromExports += voters;
      const day = dateKey(doc.completedAt || doc.createdAt);
      const voterCost = multiplyRange(BILLING_PRICING.voterProcess, voters);

      if (doc.status === 'completed') {
        exportJobs += 1;
        bulkSessions += 1;
        activities.push({
          id: `export-${String(doc._id)}`,
          activity: 'exports',
          sku: 'VDP-EXPORT-BATCH',
          resource: 'exportjobs.batch',
          region: 'ap-south-1',
          quantity: voters,
          unit: 'voter',
          unitCost: BILLING_PRICING.voterProcess,
          cost: voterCost,
          timestamp: new Date(doc.completedAt || doc.createdAt).toISOString(),
          operator: String(doc.createdByName || doc.createdBy || ''),
          metadata: {
            halkas: Array.isArray(doc.halkaNames) ? doc.halkaNames.join(', ') : '',
          },
        });
        bumpDaily(day, voters, 1, 0, addRanges(voterCost, BILLING_PRICING.bulkSession));
      } else if (voters > 0) {
        activities.push({
          id: `export-partial-${String(doc._id)}`,
          activity: 'exports',
          sku: 'VDP-EXPORT-PARTIAL',
          resource: 'exportjobs.partial',
          region: 'ap-south-1',
          quantity: voters,
          unit: 'voter',
          unitCost: BILLING_PRICING.voterProcess,
          cost: voterCost,
          timestamp: new Date(doc.createdAt).toISOString(),
          operator: String(doc.createdByName || doc.createdBy || ''),
        });
        bumpDaily(day, voters, 0, 0, voterCost);
      }
    }

    for (const doc of parchiDocs) {
      const voters = Number(doc.processedVoters) || 0;
      votersFromParchi += voters;
      const day = dateKey(doc.completedAt || doc.createdAt);
      const voterCost = multiplyRange(BILLING_PRICING.voterProcess, voters);

      if (doc.status === 'completed') {
        parchiJobs += 1;
        bulkSessions += 1;
        activities.push({
          id: `parchi-${String(doc._id)}`,
          activity: 'parchi',
          sku: 'VDP-PARCHI-BATCH',
          resource: 'voter_parchi_jobs.batch',
          region: 'ap-south-1',
          quantity: voters,
          unit: 'voter',
          unitCost: BILLING_PRICING.voterProcess,
          cost: voterCost,
          timestamp: new Date(doc.completedAt || doc.createdAt).toISOString(),
          operator: String(doc.createdByName || doc.createdBy || ''),
          metadata: { halka: String(doc.halkaName || '') },
        });
        bumpDaily(day, voters, 1, 0, addRanges(voterCost, BILLING_PRICING.bulkSession));
      } else if (voters > 0) {
        activities.push({
          id: `parchi-partial-${String(doc._id)}`,
          activity: 'parchi',
          sku: 'VDP-PARCHI-PARTIAL',
          resource: 'voter_parchi_jobs.partial',
          region: 'ap-south-1',
          quantity: voters,
          unit: 'voter',
          unitCost: BILLING_PRICING.voterProcess,
          cost: voterCost,
          timestamp: new Date(doc.createdAt).toISOString(),
          operator: String(doc.createdByName || doc.createdBy || ''),
        });
        bumpDaily(day, voters, 0, 0, voterCost);
      }
    }

    if (ocrCount > 0) {
      const ocrVoterCost = multiplyRange(BILLING_PRICING.voterProcess, ocrCount);
      activities.push({
        id: `ocr-pages-${dateKey(end)}`,
        activity: 'ocr',
        sku: 'VDP-OCR-PAGE',
        resource: 'blockcodes.completed',
        region: 'ap-south-1',
        quantity: ocrCount,
        unit: 'page',
        unitCost: BILLING_PRICING.voterProcess,
        cost: ocrVoterCost,
        timestamp: end.toISOString(),
      });
      bumpDaily(dateKey(end), ocrCount, 0, ocrCount, ocrVoterCost);
    }

    const votersProcessed = votersFromExports + votersFromParchi + voterCount + ocrCount;
    const voterProcessingCost = multiplyRange(BILLING_PRICING.voterProcess, votersProcessed);
    const bulkCompilationCost = multiplyRange(BILLING_PRICING.bulkSession, bulkSessions);

    const usageIndex = votersProcessed + bulkSessions * 120 + ocrCount * 8;
    const infrastructure = infrastructureCostForPeriod(usageIndex, days, period);

    const subtotal = addRanges(voterProcessingCost, bulkCompilationCost);
    const total = addRanges(subtotal, infrastructure);
    const dailyEstimate = dailyEstimateForPeriod(total, days);

    activities.push({
      id: `infra-${dateKey(end)}`,
      activity: 'infrastructure',
      sku: 'VDP-INFRA-NET',
      resource: 'network.bandwidth.compute',
      region: 'multi-region',
      quantity: days,
      unit: 'day',
      unitCost: dailyEstimate,
      cost: infrastructure,
      timestamp: end.toISOString(),
      metadata: { usageIndex },
    });

    const filteredActivities = filterActivitiesByType(
      activities.sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
      activity
    );

    return {
      period,
      activity,
      rangeStart: start.toISOString(),
      rangeEnd: end.toISOString(),
      daysInPeriod: days,
      metrics: {
        votersProcessed,
        bulkSessions,
        exportJobs,
        parchiJobs,
        phoneEnrichJobs: phoneData.sessions,
        ocrPagesCompleted: ocrCount,
        totalEvents: filteredActivities.length,
      },
      costs: {
        voterProcessing: voterProcessingCost,
        bulkCompilation: bulkCompilationCost,
        infrastructure,
        dailyEstimate,
        total,
      },
      activities: filteredActivities,
      dailySeries: rollupDailySeries(Array.from(dailyMap.values())),
      pricing: BILLING_PRICING,
    };
  } finally {
    await client.close();
  }
}
