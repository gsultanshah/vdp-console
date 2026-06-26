#!/usr/bin/env node
/**
 * Process voter list pages via local dev server.
 *
 * Prerequisites:
 *   1. npm run dev   (in another terminal)
 *   2. .env with NEXT_PUBLIC_MONGODB_URI set
 *   3. Title pages tagged first (tag=title pages are skipped automatically)
 *
 * Usage:
 *   npm run process-voters:local -- --halka LA39
 *   npm run process-voters:local -- --block-code 1160010
 *   npm run process-voters:local -- --block-codes 1160010,1160011 --parallel 2
 */

import { apiUrl, readJsonResponse } from './api-utils.mjs';

const DEFAULT_BASE_URL = 'http://localhost:3000';

function parseArgs(argv) {
  const options = {
    baseUrl: (process.env.BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/$/, ''),
    parallel: Number(process.env.PARALLEL || 2),
    halkaName: process.env.HALKA_NAME || '',
    blockCode: process.env.BLOCK_CODE || '',
    blockCodes: process.env.BLOCK_CODES || '',
    includeCompleted: process.env.INCLUDE_COMPLETED === 'true',
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--base-url' && next) {
      options.baseUrl = next.replace(/\/$/, '');
      i += 1;
    } else if (arg === '--parallel' && next) {
      options.parallel = Number(next);
      i += 1;
    } else if (arg === '--halka' && next) {
      options.halkaName = next;
      i += 1;
    } else if (arg === '--block-code' && next) {
      options.blockCode = next;
      i += 1;
    } else if (arg === '--block-codes' && next) {
      options.blockCodes = next;
      i += 1;
    } else if (arg === '--include-completed') {
      options.includeCompleted = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Process voters on localhost (default: ${DEFAULT_BASE_URL})

Usage:
  npm run process-voters:local -- [options]

Options:
  --halka <name>         Filter by halkaName (e.g. LA39)
  --block-code <code>    Process one block code
  --block-codes <list>   Comma-separated block codes
  --parallel <n>         Workers (default: 2 for local)
  --include-completed    Re-process completed pages
  --base-url <url>       Override base URL (default: ${DEFAULT_BASE_URL})

Notes:
  - Title pages (tag=title) are never processed
  - Each request claims one page, runs OCR, saves voters to MongoDB
  - Reset stuck pages: curl -X POST http://localhost:3000/api/blockcodes/reset-processing/

Examples:
  npm run process-voters:local -- --halka LA39 --parallel 1
  npm run process-voters:local -- --block-code 1160010
  npm run process-voters:local -- --block-codes 1160010,1160011 --parallel 2
`);
}

function buildUrl(options) {
  const params = new URLSearchParams();
  if (options.halkaName) params.set('halkaName', options.halkaName);
  if (options.blockCode) params.set('blockCode', options.blockCode);
  if (options.blockCodes) params.set('blockCodes', options.blockCodes);
  if (options.includeCompleted) params.set('includeCompleted', 'true');
  return apiUrl(options.baseUrl, '/api/process-page', params);
}

async function checkServer(baseUrl) {
  try {
    const response = await fetch(`${baseUrl}/`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok && response.status !== 308) {
      console.warn(`Warning: ${baseUrl} returned HTTP ${response.status}`);
    }
  } catch {
    console.error(`Cannot reach local server at ${baseUrl}`);
    console.error('Start it first: npm run dev');
    process.exit(1);
  }
}

async function worker(id, url) {
  let processed = 0;
  let votersSaved = 0;
  let requestNum = 0;

  while (true) {
    requestNum += 1;
    const startedAt = Date.now();
    console.log(`[worker ${id}] Request #${requestNum}: claiming next page (OCR ~30–90s)...`);

    const response = await fetch(url);
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

    if (response.status === 404) {
      console.log(
        `[worker ${id}] queue empty after ${processed} page(s), ${votersSaved} voters saved (${elapsed}s)`
      );
      break;
    }

    const { data, parseError } = await readJsonResponse(response);

    if (parseError) {
      console.error(`[worker ${id}] ${parseError} (${elapsed}s)`);
      break;
    }

    if (!response.ok) {
      console.error(`[worker ${id}] HTTP ${response.status} (${elapsed}s):`, data.error || data.details);
      if (response.status >= 500) break;
      continue;
    }

    processed += 1;
    votersSaved += data.processed_count ?? 0;
    const page = data.processed_page;
    const voters = data.voters ?? {};
    console.log(
      `[worker ${id}] ${page.blockCode} ${page.fileName} → ` +
        `${data.processed_count ?? 0} saved, ${data.error_count ?? 0} errors, ` +
        `${voters.duplicates ?? 0} duplicates, ${data.queue.remaining} remaining (${elapsed}s)`
    );
  }

  return { processed, votersSaved };
}

async function main() {
  const options = parseArgs(process.argv);
  const parallel = Math.min(Math.max(1, options.parallel || 2), 50);

  if (!options.blockCode && !options.blockCodes && !options.halkaName) {
    console.error('Error: provide --halka, --block-code, or --block-codes');
    printHelp();
    process.exit(1);
  }

  const url = buildUrl(options);

  console.log(`Local server: ${options.baseUrl}`);
  await checkServer(options.baseUrl);
  console.log(`Workers: ${parallel}`);
  console.log(`Endpoint: ${url}`);
  console.log('\nNote: Title pages (tag=title) are skipped. Each page is OCR\'d and voters saved to MongoDB.');
  console.log('Run mark-title-pages first if title pages are not yet tagged.\n');

  const totals = await Promise.all(
    Array.from({ length: parallel }, (_, index) => worker(index + 1, url))
  );

  const pages = totals.reduce((sum, item) => sum + item.processed, 0);
  const voters = totals.reduce((sum, item) => sum + item.votersSaved, 0);

  console.log('\nDone.');
  console.log(`Pages processed: ${pages}`);
  console.log(`Voters saved: ${voters}`);
  console.log(`Per worker pages: ${totals.map((item) => item.processed).join(', ')}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
