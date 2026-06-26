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
  console.log(`Process voter pages in parallel via /api/process-page

Usage:
  node scripts/process-voters-parallel.mjs [options]

Options:
  --base-url <url>       API base URL (default: ${DEFAULT_BASE_URL})
  --parallel <n>         Number of workers (default: 10, max: 50)
  --halka <name>         Filter by halkaName (e.g. LA39)
  --block-code <code>    Filter by single block code
  --block-codes <list>   Comma-separated block codes
  --include-completed    Re-process completed pages

Environment variables:
  BASE_URL, PARALLEL, HALKA_NAME, BLOCK_CODE, BLOCK_CODES, INCLUDE_COMPLETED

Examples:
  node scripts/process-voters-parallel.mjs --halka LA39 --block-codes 1160010,1160011 --parallel 10
  BASE_URL=http://localhost:3000 node scripts/process-voters-parallel.mjs --block-code 1160010
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

async function worker(id, url) {
  let processed = 0;
  let votersSaved = 0;

  while (true) {
    const response = await fetch(url);

    if (response.status === 404) {
      console.log(`[worker ${id}] queue empty after ${processed} page(s), ${votersSaved} voters saved`);
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
    votersSaved += data.processed_count ?? 0;
    const page = data.processed_page;
    console.log(
      `[worker ${id}] ${page.blockCode} ${page.fileName} → ` +
        `${data.processed_count ?? 0} saved, ${data.error_count ?? 0} errors, ` +
        `${data.queue.remaining} remaining`
    );
  }

  return { processed, votersSaved };
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

  const pages = totals.reduce((sum, item) => sum + item.processed, 0);
  const voters = totals.reduce((sum, item) => sum + item.votersSaved, 0);

  console.log('\nDone.');
  console.log(`Pages processed: ${pages}`);
  console.log(`Voters saved: ${voters}`);
  console.log(`Per worker: ${totals.map((item) => item.processed).join(', ')}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
