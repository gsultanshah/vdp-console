#!/usr/bin/env node
/**
 * Tag title pages via local dev server.
 *
 * Prerequisites:
 *   1. npm run dev   (in another terminal)
 *   2. .env with NEXT_PUBLIC_MONGODB_URI set
 *
 * Usage:
 *   npm run mark-title-pages:local -- --halka LA39
 *   npm run mark-title-pages:local -- --block-code 1160010
 *   npm run mark-title-pages:local -- --block-codes 1160010,1160011 --parallel 2
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
    retag: process.env.RETAG === 'true',
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
    } else if (arg === '--retag') {
      options.retag = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Mark title pages on localhost (default: ${DEFAULT_BASE_URL})

Usage:
  npm run mark-title-pages:local -- [options]

Options:
  --halka <name>         Filter by halkaName (e.g. LA39)
  --block-code <code>    Tag one block code
  --block-codes <list>   Comma-separated block codes
  --parallel <n>         Workers (default: 2 for local)
  --retag                Re-tag block codes already marked done
  --base-url <url>       Override base URL (default: ${DEFAULT_BASE_URL})

Examples:
  npm run mark-title-pages:local -- --halka LA39
  npm run mark-title-pages:local -- --block-code 1160010
  npm run mark-title-pages:local -- --block-codes 1160010,1160011 --parallel 1
`);
}

function buildUrl(options) {
  const params = new URLSearchParams();
  if (options.halkaName) params.set('halkaName', options.halkaName);
  if (options.blockCode) params.set('blockCode', options.blockCode);
  if (options.blockCodes) params.set('blockCodes', options.blockCodes);
  if (options.retag) params.set('retag', 'true');
  return apiUrl(options.baseUrl, '/api/mark-title-pages', params);
}

async function checkServer(url) {
  const healthUrl = url.replace(/\/api\/mark-title-pages\/\?.*$/, '/');
  try {
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(5000) });
    if (!response.ok && response.status !== 308) {
      console.warn(`Warning: ${healthUrl} returned HTTP ${response.status}`);
    }
  } catch {
    console.error(`Cannot reach local server at ${healthUrl}`);
    console.error('Start it first: npm run dev');
    process.exit(1);
  }
}

async function worker(id, url) {
  let processed = 0;
  let inFlight = 0;

  while (true) {
    inFlight += 1;
    const requestNum = inFlight;
    const startedAt = Date.now();
    console.log(`[worker ${id}] Request #${requestNum}: claiming next block code (OCR may take 1–3 min)...`);

    const response = await fetch(url);
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

    if (response.status === 404) {
      console.log(`[worker ${id}] queue empty after ${processed} block code(s) (${elapsed}s)`);
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
    const block = data.processed_block_code;
    const titles = block.titlePages.map((page) => page.fileName).join(', ') || '(none)';
    console.log(
      `[worker ${id}] ${block.blockCode} → ` +
        `${block.titlesUpdated} title, ${block.regularUpdated} regular ` +
        `[${titles}] — ${data.queue.remaining} left (${elapsed}s, ${block.pagesScored} pages OCR'd)`
    );
  }

  return processed;
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
  await checkServer(url);
  console.log(`Workers: ${parallel}`);
  console.log(`Endpoint: ${url}`);
  console.log('\nNote: Each request OCRs every page in one block code. First result may take 1–3 minutes.');
  console.log('Watch the terminal running "npm run dev" for server-side OCR progress.\n');

  const totals = await Promise.all(
    Array.from({ length: parallel }, (_, index) => worker(index + 1, url))
  );

  const blockCodes = totals.reduce((sum, count) => sum + count, 0);
  console.log('\nDone.');
  console.log(`Block codes tagged: ${blockCodes}`);
  console.log(`Per worker: ${totals.join(', ')}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
