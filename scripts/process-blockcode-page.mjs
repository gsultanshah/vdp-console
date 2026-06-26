#!/usr/bin/env node
/**
 * Process a single blockcodes page: OCR only or full pipeline.
 *
 * Usage:
 *   node scripts/process-blockcode-page.mjs --page-id 6a3ddd83f1dcd7eb30bbcaf8 --mode ocr_only
 *   node scripts/process-blockcode-page.mjs --block-code 5010013 --file-name Binder1_Page_0157.jpg --mode full
 *   node scripts/process-blockcode-page.mjs --page-id xxx --base-url https://main.d1s856nzkojypn.amplifyapp.com
 */

import { apiUrl, readJsonResponse } from './api-utils.mjs';

const DEFAULT_BASE_URL = process.env.BASE_URL?.trim() || 'http://localhost:3000';
const DEFAULT_LIVE_URL = 'https://main.d1s856nzkojypn.amplifyapp.com';

function parseArgs(argv) {
  const options = {
    baseUrl: DEFAULT_BASE_URL.replace(/\/$/, ''),
    pageId: process.env.PAGE_ID || '',
    blockCode: process.env.BLOCK_CODE || '',
    fileName: process.env.FILE_NAME || '',
    mode: process.env.MODE || 'full',
    live: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--base-url' && next) {
      options.baseUrl = next.replace(/\/$/, '');
      i += 1;
    } else if (arg === '--live') {
      options.live = true;
      options.baseUrl = DEFAULT_LIVE_URL;
    } else if (arg === '--local') {
      options.baseUrl = 'http://localhost:3000';
    } else if (arg === '--page-id' && next) {
      options.pageId = next;
      i += 1;
    } else if (arg === '--block-code' && next) {
      options.blockCode = next;
      i += 1;
    } else if (arg === '--file-name' && next) {
      options.fileName = next;
      i += 1;
    } else if (arg === '--mode' && next) {
      options.mode = next;
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Process one blockcodes page via /api/blockcodes/process-document

Usage:
  npm run process-blockcode-page -- [options]

Options:
  --page-id <id>         MongoDB _id of the blockcodes document
  --block-code <code>    Lookup with --file-name
  --file-name <name>     Lookup with --block-code
  --mode <mode>          ocr_only | full (default: full)
  --base-url <url>       API host (default: ${DEFAULT_BASE_URL})
  --local                Use http://localhost:3000
  --live                 Use ${DEFAULT_LIVE_URL}

Modes:
  ocr_only   Run OCR and save/update ocr_data on the blockcodes document
  full       OCR + ocr_data + save voters + mark page completed

Examples:
  npm run process-blockcode-page -- --page-id 6a3ddd83f1dcd7eb30bbcaf8 --mode ocr_only --local
  npm run process-blockcode-page -- --block-code 5010013 --file-name Binder1_Page_0157.jpg --mode full --live
`);
}

function buildUrl(options) {
  const params = new URLSearchParams();
  if (options.pageId) params.set('page_id', options.pageId);
  if (options.blockCode) params.set('blockCode', options.blockCode);
  if (options.fileName) params.set('fileName', options.fileName);
  params.set('mode', options.mode === 'ocr_only' ? 'ocr_only' : 'full');
  return apiUrl(options.baseUrl, '/api/blockcodes/process-document', params);
}

async function main() {
  const options = parseArgs(process.argv);

  if (!options.pageId && !(options.blockCode && options.fileName)) {
    console.error('Error: provide --page-id or both --block-code and --file-name');
    printHelp();
    process.exit(1);
  }

  if (!['ocr_only', 'full'].includes(options.mode)) {
    console.error('Error: --mode must be ocr_only or full');
    process.exit(1);
  }

  const url = buildUrl(options);
  console.log(`Base URL: ${options.baseUrl}`);
  console.log(`Mode: ${options.mode}`);
  console.log(`Endpoint: ${url}\n`);
  console.log('Running OCR (may take 30–90 seconds)...\n');

  const startedAt = Date.now();
  const response = await fetch(url);
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  const { data, parseError } = await readJsonResponse(response);

  if (parseError) {
    console.error(parseError);
    process.exit(1);
  }

  if (!response.ok) {
    console.error(`HTTP ${response.status} (${elapsed}s):`, data?.error || data?.details);
    process.exit(1);
  }

  const page = data.page;
  console.log(`Page: ${page.blockCode} / ${page.fileName}`);
  console.log(`Status: ${page.status}`);
  console.log(`OCR saved: yes (${data.ocr_data?.finalJson?.length ?? 0} voter rows parsed)`);

  if (data.mode === 'full' && data.voters) {
    console.log(
      `Voters: ${data.voters.saved} saved, ${data.voters.errors} errors, ` +
        `${data.voters.duplicates} duplicates, ${data.voters.skippedNoCnic} skipped (no CNIC)`
    );
  }

  console.log(`Completed in ${elapsed}s`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
