#!/usr/bin/env node
/**
 * Run OCR in parallel for all blockcodes pages in a halka (no HTTP server).
 * Saves ocr_data on each blockcodes document.
 *
 * Usage:
 *   npm run process-ocr -- --halka LA39 --parallel 20
 *   npm run process-ocr -- --halka LA39 --block-codes 1160010,1160011 --parallel 5
 *   npm run process-ocr -- --halka LA39 --force --parallel 10
 */

import { MongoClient } from 'mongodb';
import { loadEnv } from './load-env.mjs';
import { processOcrForClaimedPage } from '../src/lib/blockcode-document';
import {
  claimNextOcrPage,
  countRemainingOcrPages,
  parseOcrBatchFilters,
  type OcrBatchFilters,
} from '../src/lib/ocr-batch';

loadEnv();

interface CliOptions {
  halkaName: string;
  parallel: number;
  blockCode: string;
  blockCodes: string;
  force: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    halkaName: process.env.HALKA_NAME || '',
    parallel: Number(process.env.PARALLEL || 20),
    blockCode: process.env.BLOCK_CODE || '',
    blockCodes: process.env.BLOCK_CODES || '',
    force: process.env.FORCE === 'true',
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
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Run OCR in parallel and save ocr_data on blockcodes (no HTTP server)

Usage:
  npm run process-ocr -- [options]

Options:
  --halka <name>         Halka name (required, e.g. LA39)
  --parallel <n>         Number of workers (default: 20, max: 50)
  --block-code <code>    Limit to one block code
  --block-codes <list>   Comma-separated block codes
  --force                Re-run OCR even when ocr_data already exists

Environment variables:
  HALKA_NAME, PARALLEL, BLOCK_CODE, BLOCK_CODES, FORCE

Requires NEXT_PUBLIC_MONGODB_URI and Google Vision credentials in .env.

Examples:
  npm run process-ocr -- --halka LA39 --parallel 20
  npm run process-ocr -- --halka LA39 --block-codes 1160010,1160011 --parallel 10
  npm run process-ocr -- --halka LA39 --force --parallel 5
`);
}

interface WorkerStats {
  processed: number;
  errors: number;
  voterRows: number;
}

async function worker(
  id: number,
  db: import('mongodb').Db,
  filters: OcrBatchFilters
): Promise<WorkerStats> {
  const stats: WorkerStats = { processed: 0, errors: 0, voterRows: 0 };
  let requestNum = 0;

  while (true) {
    const document = await claimNextOcrPage(db, filters);
    if (!document) {
      console.log(
        `[worker ${id}] queue empty after ${stats.processed} page(s), ${stats.errors} error(s)`
      );
      break;
    }

    requestNum += 1;
    const startedAt = Date.now();
    const pageLabel = `${document.blockCode} / ${document.fileName}`;

    console.log(`[worker ${id}] #${requestNum}: OCR ${pageLabel} (~30–90s)...`);

    try {
      const ocr_data = await processOcrForClaimedPage(db, document);
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      const remaining = await countRemainingOcrPages(db, filters);

      stats.processed += 1;
      stats.voterRows += ocr_data.finalJson.length;

      console.log(
        `[worker ${id}] ${pageLabel} → ${ocr_data.finalJson.length} voter rows, ` +
          `${remaining} remaining (${elapsed}s)`
      );
    } catch (error) {
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      const message = error instanceof Error ? error.message : String(error);
      stats.errors += 1;

      console.error(`[worker ${id}] ${pageLabel} failed (${elapsed}s): ${message}`);
    }
  }

  return stats;
}

async function main() {
  const options = parseArgs(process.argv);
  const parallel = Math.min(Math.max(1, options.parallel || 20), 50);

  let filters: OcrBatchFilters;
  try {
    filters = parseOcrBatchFilters({
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

  const client = new MongoClient(uri);
  const startedAt = Date.now();

  try {
    await client.connect();
    const db = client.db('vdp');
    const pending = await countRemainingOcrPages(db, filters);

    console.log(`Halka: ${filters.halkaName}`);
    console.log(`Workers: ${parallel}`);
    console.log(`Force re-OCR: ${filters.force ? 'yes' : 'no'}`);
    if (filters.blockCode) console.log(`Block code: ${filters.blockCode}`);
    if (filters.blockCodes?.length) console.log(`Block codes: ${filters.blockCodes.join(', ')}`);
    console.log(`Pages to process: ${pending}`);
    console.log('Each page runs Google Vision OCR and saves ocr_data to blockcodes.\n');

    if (pending === 0) {
      console.log('Nothing to process.');
      return;
    }

    const totals = await Promise.all(
      Array.from({ length: parallel }, (_, index) => worker(index + 1, db, filters))
    );

    const pages = totals.reduce((sum, item) => sum + item.processed, 0);
    const errors = totals.reduce((sum, item) => sum + item.errors, 0);
    const voterRows = totals.reduce((sum, item) => sum + item.voterRows, 0);
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

    console.log('\nDone.');
    console.log(`Pages OCR'd: ${pages}`);
    console.log(`Errors: ${errors}`);
    console.log(`Voter rows parsed: ${voterRows}`);
    console.log(`Per worker pages: ${totals.map((item) => item.processed).join(', ')}`);
    console.log(`Total time: ${elapsed}s`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('UNAUTHENTICATED') || message.includes('invalid_grant')) {
      console.error('Google Vision authentication failed. Run: npm run test-google-vision');
      process.exit(1);
    }

    console.error('Failed:', message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();
