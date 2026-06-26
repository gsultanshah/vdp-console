#!/usr/bin/env node

import { apiUrl, readJsonResponse } from './api-utils.mjs';

const DEFAULT_BASE_URL = 'https://main.d1s856nzkojypn.amplifyapp.com';

function parseArgs(argv) {
  const options = {
    baseUrl: (process.env.BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/$/, ''),
    parallel: Number(process.env.PARALLEL || 10),
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
  console.log(`Mark title pages in parallel via /api/mark-title-pages

Usage:
  node scripts/mark-title-pages-parallel.mjs [options]

Options:
  --base-url <url>       API base URL (default: ${DEFAULT_BASE_URL})
  --parallel <n>         Number of workers (default: 10, max: 50)
  --halka <name>         Filter by halkaName (e.g. LA39)
  --block-code <code>    Process a specific block code
  --block-codes <list>   Comma-separated block codes for auto-select
  --retag                Re-tag block codes already marked done

Environment variables:
  BASE_URL, PARALLEL, HALKA_NAME, BLOCK_CODE, BLOCK_CODES, RETAG

Examples:
  node scripts/mark-title-pages-parallel.mjs --halka LA39 --parallel 10
  node scripts/mark-title-pages-parallel.mjs --block-codes 1160010,1160011 --parallel 5
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

async function worker(id, url) {
  let processed = 0;

  while (true) {
    const response = await fetch(url);

    if (response.status === 404) {
      console.log(`[worker ${id}] queue empty after ${processed} block code(s)`);
      break;
    }

    const { data, parseError } = await readJsonResponse(response);

    if (parseError) {
      console.error(`[worker ${id}] ${parseError}`);
      break;
    }

    if (!response.ok) {
      console.error(`[worker ${id}] HTTP ${response.status}:`, data.error || data.details);
      if (response.status >= 500) break;
      continue;
    }

    processed += 1;
    const block = data.processed_block_code;
    const titles = block.titlePages.map((page) => page.fileName).join(', ') || '(none)';
    console.log(
      `[worker ${id}] ${block.blockCode} → ` +
        `${block.titlesUpdated} title, ${block.regularUpdated} regular ` +
        `[${titles}] — ${data.queue.remaining} block codes left`
    );
  }

  return processed;
}

async function main() {
  const options = parseArgs(process.argv);
  const parallel = Math.min(Math.max(1, options.parallel || 10), 50);

  if (!options.blockCode && !options.blockCodes && !options.halkaName) {
    console.error('Error: provide --halka, --block-code, or --block-codes');
    printHelp();
    process.exit(1);
  }

  const url = buildUrl(options);
  console.log(`Base URL: ${options.baseUrl}`);
  console.log(`Starting ${parallel} workers`);
  console.log(`Endpoint: ${url}\n`);

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
