#!/usr/bin/env node
/**
 * Enrich existing voters from blockcodes OCR data (reproduction + page cutting fields).
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
  parseVoterEnrichBatchFilters,
  processEnrichForClaimedPage,
  recoverStaleEnrichClaims,
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
}

let shouldStop = false;

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    halkaName: process.env.HALKA_NAME || '',
    parallel: Number(process.env.PARALLEL || 20),
    blockCode: process.env.BLOCK_CODE || '',
    blockCodes: process.env.BLOCK_CODES || '',
    force: process.env.FORCE === 'true',
    releaseClaims: false,
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
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Enrich existing voters from blockcodes OCR (reproduction + row crop data)

Usage:
  npm run enrich-voters -- [options]

Options:
  --halka <name>         Halka name (required, e.g. LA39)
  --parallel <n>         Number of workers (default: 20, max: 50)
  --block-code <code>    Limit to one block code
  --block-codes <list>   Comma-separated block codes
  --force                Re-enrich pages already marked voterEnrichAt
  --release-claims       Clear in-flight claims and exit (resume helper)

Scope:
  blockcodes where tag=regular and ocr_data exists.
  For each OCR voter row, updates matching voters (cnic + halkaName) only.

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
  notFound: number;
  unchanged: number;
  skippedNoCnic: number;
}

function mergePageStats(totals: WorkerStats, page: VoterEnrichPageResult) {
  totals.enriched += page.enriched;
  totals.notFound += page.notFound;
  totals.unchanged += page.unchanged;
  totals.skippedNoCnic += page.skippedNoCnic;
}

async function worker(
  id: number,
  db: import('mongodb').Db,
  filters: VoterEnrichBatchFilters
): Promise<WorkerStats> {
  const stats: WorkerStats = {
    pages: 0,
    errors: 0,
    enriched: 0,
    notFound: 0,
    unchanged: 0,
    skippedNoCnic: 0,
  };
  let requestNum = 0;

  while (!shouldStop) {
    const document = await claimNextEnrichPage(db, filters);
    if (!document) {
      console.log(
        `[worker ${id}] queue empty after ${stats.pages} page(s), ${stats.errors} error(s)`
      );
      break;
    }

    requestNum += 1;
    const startedAt = Date.now();
    const pageLabel = `${document.blockCode} / ${document.fileName}`;

    console.log(`[worker ${id}] #${requestNum}: enrich ${pageLabel}...`);

    try {
      const pageStats = await processEnrichForClaimedPage(db, document);
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      const remaining = await countRemainingEnrichPages(db, filters);

      stats.pages += 1;
      mergePageStats(stats, pageStats);

      console.log(
        `[worker ${id}] ${pageLabel} → enriched ${pageStats.enriched}, ` +
          `not found ${pageStats.notFound}, unchanged ${pageStats.unchanged}, ` +
          `${remaining} pages remaining (${elapsed}s)`
      );
    } catch (error) {
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      const message = error instanceof Error ? error.message : String(error);
      stats.errors += 1;

      await releaseEnrichClaim(db, document._id);
      console.error(`[worker ${id}] ${pageLabel} failed (${elapsed}s): ${message}`);
    }

    if (shouldStop) {
      console.log(`[worker ${id}] stop requested — exiting after current page`);
      break;
    }
  }

  return stats;
}

function setupSignalHandlers() {
  const onStop = (signal: string) => {
    if (shouldStop) {
      console.log(`\n${signal} again — waiting for workers to finish current pages...`);
      return;
    }
    shouldStop = true;
    console.log(`\n${signal} received — finishing current pages, then stopping. Re-run to resume.`);
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

  const client = new MongoClient(uri);
  const startedAt = Date.now();

  try {
    await client.connect();
    const db = client.db('vdp');

    if (options.releaseClaims) {
      const released = await releaseAllEnrichClaims(db, filters);
      console.log(`Released ${released} in-flight enrich claim(s) for ${filters.halkaName}.`);
      return;
    }

    const recovered = await recoverStaleEnrichClaims(db, filters);
    if (recovered > 0) {
      console.log(`Recovered ${recovered} stale enrich claim(s).`);
    }

    const pending = await countRemainingEnrichPages(db, filters);

    console.log(`Halka: ${filters.halkaName}`);
    console.log(`Workers: ${parallel}`);
    console.log(`Force re-enrich: ${filters.force ? 'yes' : 'no'}`);
    if (filters.blockCode) console.log(`Block code: ${filters.blockCode}`);
    if (filters.blockCodes?.length) console.log(`Block codes: ${filters.blockCodes.join(', ')}`);
    console.log(`Pages to enrich: ${pending}`);
    console.log('Updates existing voters only (cnic + halkaName). Ctrl+C to stop gracefully.\n');

    if (pending === 0) {
      console.log('Nothing to enrich.');
      return;
    }

    const totals = await Promise.all(
      Array.from({ length: parallel }, (_, index) => worker(index + 1, db, filters))
    );

    const pages = totals.reduce((sum, item) => sum + item.pages, 0);
    const errors = totals.reduce((sum, item) => sum + item.errors, 0);
    const enriched = totals.reduce((sum, item) => sum + item.enriched, 0);
    const notFound = totals.reduce((sum, item) => sum + item.notFound, 0);
    const unchanged = totals.reduce((sum, item) => sum + item.unchanged, 0);
    const skippedNoCnic = totals.reduce((sum, item) => sum + item.skippedNoCnic, 0);
    const remaining = await countRemainingEnrichPages(db, filters);
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

    console.log('\nDone.');
    console.log(`Pages processed: ${pages}`);
    console.log(`Voters enriched: ${enriched}`);
    console.log(`Voters not found: ${notFound}`);
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
    console.error('Failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();
