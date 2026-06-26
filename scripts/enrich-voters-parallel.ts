#!/usr/bin/env node
/**
 * Enrich voters from blockcodes OCR data — creates missing voters and updates existing ones.
 *
 * Usage:
 *   npm run enrich-voters -- --halka LA39 --parallel 20
 *   npm run enrich-voters -- --halka LA39 --force --parallel 10
 *   npm run enrich-voters -- --halka LA39 --release-claims
 *
 * Stop: Ctrl+C — workers finish the current page, then exit. Re-run to resume.
 */

import { MongoClient } from 'mongodb';
import { loadEnv } from './load-env.mjs';
import {
  claimNextEnrichPage,
  countRemainingEnrichPages,
  ensureEnrichIndexes,
  parseVoterEnrichBatchFilters,
  processEnrichForClaimedPage,
  releaseAllEnrichClaims,
  releaseEnrichClaim,
  type VoterEnrichBatchFilters,
  type VoterEnrichPageResult,
} from '../src/lib/voter-enrich-batch';

loadEnv();

interface CliOptions {
  halkaName: string;
  parallel: number;
  blockCode: string;
  blockCodes: string;
  force: boolean;
  releaseClaims: boolean;
  verbose: boolean;
}

let shouldStop = false;
let stopSignalCount = 0;

class ProgressTracker {
  total: number | null = null;
  completed = 0;
  errors = 0;
  created = 0;
  enriched = 0;
  unchanged = 0;
  inFlight = 0;
  claiming = 0;
  private lastLine = '';

  setTotal(total: number) {
    this.total = total;
    this.render();
  }

  pageStarted() {
    this.inFlight += 1;
    this.render();
  }

  claimWaiting() {
    this.claiming += 1;
    this.render();
  }

  claimDone() {
    this.claiming = Math.max(0, this.claiming - 1);
    this.render();
  }

  pageFinished(stats: VoterEnrichPageResult) {
    this.inFlight = Math.max(0, this.inFlight - 1);
    this.completed += 1;
    this.created += stats.created;
    this.enriched += stats.enriched;
    this.unchanged += stats.unchanged;
    this.render();
  }

  pageFailed() {
    this.inFlight = Math.max(0, this.inFlight - 1);
    this.completed += 1;
    this.errors += 1;
    this.render();
  }

  render() {
    const width = 36;
    const total = this.total ?? Math.max(this.completed + this.inFlight, 1);
    const pct = this.total ? Math.min(100, Math.round((this.completed / this.total) * 100)) : 0;
    const filled = this.total
      ? Math.min(width, Math.round((this.completed / this.total) * width))
      : Math.min(width, Math.round((this.completed / total) * width));
    const bar =
      '='.repeat(filled) +
      (filled < width ? '>' : '') +
      ' '.repeat(Math.max(0, width - filled - (filled < width ? 1 : 0)));

    const totalLabel = this.total != null ? `${this.completed}/${this.total}` : `${this.completed}`;
    const pctLabel = this.total != null ? ` (${pct}%)` : '';
    const line =
      `[${bar}] ${totalLabel}${pctLabel} | ` +
      `+${this.created} created, ${this.enriched} enriched, ${this.unchanged} unchanged, ` +
      `${this.errors} errors, ${this.claiming} claiming, ${this.inFlight} processing`;

    if (line !== this.lastLine) {
      process.stdout.write(`\r${line.padEnd(120)}`);
      this.lastLine = line;
    }
  }

  finish() {
    process.stdout.write('\n');
  }
}

const progress = new ProgressTracker();

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    halkaName: process.env.HALKA_NAME || '',
    parallel: Number(process.env.PARALLEL || 20),
    blockCode: process.env.BLOCK_CODE || '',
    blockCodes: process.env.BLOCK_CODES || '',
    force: process.env.FORCE === 'true',
    releaseClaims: false,
    verbose: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--halka' && next) {
      options.halkaName = next;
      i += 1;
    } else if (arg === '--parallel' && next) {
      options.parallel = Number(next);
      i += 1;
    } else if (arg === '--block-code' && next) {
      options.blockCode = next;
      i += 1;
    } else if (arg === '--block-codes' && next) {
      options.blockCodes = next;
      i += 1;
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg === '--release-claims') {
      options.releaseClaims = true;
    } else if (arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Enrich voters from blockcodes OCR — creates missing voters and updates existing ones

Usage:
  npm run enrich-voters -- [options]

Options:
  --halka <name>         Halka name (required, e.g. LA39)
  --parallel <n>         Number of workers (default: 20, max: 50)
  --block-code <code>    Limit to one block code
  --block-codes <list>   Comma-separated block codes
  --force                Re-enrich pages already marked voterEnrichAt
  --release-claims       Clear in-flight claims and exit (resume helper)
  --verbose              Log each page as workers process it

Scope:
  blockcodes where tag=regular and ocr_data exists.
  For each OCR voter row, upserts voters (cnic + halkaName): creates if missing, enriches if existing.

Stop / resume:
  Press Ctrl+C to stop gracefully — current pages complete, then workers exit.
  Re-run the same command to resume; pages without voterEnrichAt are picked up.
  Stale claims older than 15 minutes are auto-released on startup.

Examples:
  npm run enrich-voters -- --halka LA39 --parallel 20
  npm run enrich-voters -- --halka LA39 --block-codes 1180001,1180002 --parallel 10
  npm run enrich-voters -- --halka LA39 --force
  npm run enrich-voters -- --halka LA39 --release-claims
`);
}

interface WorkerStats {
  pages: number;
  errors: number;
  enriched: number;
  created: number;
  unchanged: number;
  skippedNoCnic: number;
}

function mergePageStats(totals: WorkerStats, page: VoterEnrichPageResult) {
  totals.enriched += page.enriched;
  totals.created += page.created;
  totals.unchanged += page.unchanged;
  totals.skippedNoCnic += page.skippedNoCnic;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function worker(
  id: number,
  db: import('mongodb').Db,
  filters: VoterEnrichBatchFilters,
  verbose: boolean
): Promise<WorkerStats> {
  const stats: WorkerStats = {
    pages: 0,
    errors: 0,
    enriched: 0,
    created: 0,
    unchanged: 0,
    skippedNoCnic: 0,
  };
  let requestNum = 0;
  await sleep((id - 1) * 1000);

  while (!shouldStop) {
    progress.claimWaiting();
    let document: Awaited<ReturnType<typeof claimNextEnrichPage>> | null = null;
    try {
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        try {
          document = await claimNextEnrichPage(db, filters);
          break;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (attempt === 5 || shouldStop) {
            throw error;
          }
          if (verbose) {
            console.warn(`\n[worker ${id}] claim attempt ${attempt} failed: ${message}`);
          }
          await sleep(2000 * attempt);
        }
      }
    } finally {
      progress.claimDone();
    }

    if (!document) {
      if (verbose) {
        console.log(
          `\n[worker ${id}] queue empty after ${stats.pages} page(s), ${stats.errors} error(s)`
        );
      }
      break;
    }

    requestNum += 1;
    const startedAt = Date.now();
    const pageLabel = `${document.blockCode} / ${document.fileName}`;

    progress.pageStarted();
    if (verbose) {
      console.log(`\n[worker ${id}] #${requestNum}: enrich ${pageLabel}...`);
    }

    try {
      const pageStats = await processEnrichForClaimedPage(db, document);
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

      stats.pages += 1;
      mergePageStats(stats, pageStats);
      progress.pageFinished(pageStats);

      if (verbose) {
        console.log(
          `\n[worker ${id}] ${pageLabel} → created ${pageStats.created}, enriched ${pageStats.enriched}, ` +
            `unchanged ${pageStats.unchanged} (${elapsed}s)`
        );
      }
    } catch (error) {
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      const message = error instanceof Error ? error.message : String(error);
      stats.errors += 1;

      await releaseEnrichClaim(db, document._id);
      progress.pageFailed();
      console.error(`\n[worker ${id}] ${pageLabel} failed (${elapsed}s): ${message}`);
    }

    if (shouldStop) {
      if (verbose) {
        console.log(`\n[worker ${id}] stop requested — exiting after current page`);
      }
      break;
    }
  }

  return stats;
}

function setupSignalHandlers() {
  const onStop = (signal: string) => {
    stopSignalCount += 1;
    if (stopSignalCount === 1) {
      shouldStop = true;
      console.log(`\n${signal} received — finishing current pages, then stopping. Re-run to resume.`);
      return;
    }
    if (stopSignalCount === 2) {
      console.log(`\n${signal} again — force exit in 2s if pages do not finish...`);
      setTimeout(() => {
        if (shouldStop) {
          console.log('\nForce exit.');
          process.exit(130);
        }
      }, 2000);
      return;
    }
    console.log('\nForce exit.');
    process.exit(130);
  };

  process.on('SIGINT', () => onStop('SIGINT'));
  process.on('SIGTERM', () => onStop('SIGTERM'));
}

async function main() {
  const options = parseArgs(process.argv);
  const parallel = Math.min(Math.max(1, options.parallel || 20), 50);

  let filters: VoterEnrichBatchFilters;
  try {
    filters = parseVoterEnrichBatchFilters({
      halkaName: options.halkaName,
      blockCode: options.blockCode || undefined,
      blockCodes: options.blockCodes || undefined,
      force: options.force,
    });
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    printHelp();
    process.exit(1);
  }

  const uri = process.env.NEXT_PUBLIC_MONGODB_URI;
  if (!uri) {
    console.error('Error: NEXT_PUBLIC_MONGODB_URI is not set in .env');
    process.exit(1);
  }

  setupSignalHandlers();

  console.log(`Halka: ${filters.halkaName}`);
  console.log(`Workers: ${parallel}`);
  console.log(`Force re-enrich: ${filters.force ? 'yes' : 'no'}`);
  if (filters.blockCode) console.log(`Block code: ${filters.blockCode}`);
  if (filters.blockCodes?.length) console.log(`Block codes: ${filters.blockCodes.join(', ')}`);
  console.log('Connecting to MongoDB...');

  const client = new MongoClient(uri);
  const startedAt = Date.now();

  try {
    await client.connect();
    console.log('Connected.');
    const db = client.db('vdp');

    if (options.releaseClaims) {
      await ensureEnrichIndexes(db).catch(() => undefined);
      const released = await releaseAllEnrichClaims(db, filters);
      console.log(`Released ${released} in-flight enrich claim(s) for ${filters.halkaName}.`);
      return;
    }

    console.log('Starting workers...\n');
    progress.render();

    void ensureEnrichIndexes(db).catch((error) => {
      console.warn(
        `\nIndex setup warning: ${error instanceof Error ? error.message : String(error)}`
      );
    });

    void releaseAllEnrichClaims(db, filters).then((released) => {
      if (released > 0) {
        console.log(`\nReleased ${released} in-flight claim(s) from a prior run.`);
      }
    });

    const countPromise = countRemainingEnrichPages(db, filters)
      .then((pending) => {
        progress.setTotal(pending + progress.completed);
        return pending;
      })
      .catch(() => null);

    const workerPromise = Promise.all(
      Array.from({ length: parallel }, (_, index) => worker(index + 1, db, filters, options.verbose))
    );

    const [, totals] = await Promise.all([countPromise, workerPromise]);
    progress.finish();

    const pages = totals.reduce((sum, item) => sum + item.pages, 0);
    const errors = totals.reduce((sum, item) => sum + item.errors, 0);
    const enriched = totals.reduce((sum, item) => sum + item.enriched, 0);
    const created = totals.reduce((sum, item) => sum + item.created, 0);
    const unchanged = totals.reduce((sum, item) => sum + item.unchanged, 0);
    const skippedNoCnic = totals.reduce((sum, item) => sum + item.skippedNoCnic, 0);
    const remaining = await countRemainingEnrichPages(db, filters);
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

    console.log('\nDone.');
    console.log(`Pages processed: ${pages}`);
    console.log(`Voters created: ${created}`);
    console.log(`Voters enriched: ${enriched}`);
    console.log(`Voters unchanged: ${unchanged}`);
    console.log(`Rows skipped (no CNIC): ${skippedNoCnic}`);
    console.log(`Page errors: ${errors}`);
    console.log(`Pages remaining: ${remaining}`);
    if (shouldStop) {
      console.log('Stopped early — re-run the same command to resume.');
    }
    console.log(`Per worker pages: ${totals.map((item) => item.pages).join(', ')}`);
    console.log(`Total time: ${elapsed}s`);
  } catch (error) {
    progress.finish();
    console.error('Failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();
