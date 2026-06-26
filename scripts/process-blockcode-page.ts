#!/usr/bin/env node
/**
 * Process a single blockcodes page directly (no HTTP server).
 * Connects to MongoDB from .env and runs OCR + save locally.
 *
 * Usage:
 *   npm run process-blockcode-page -- --page-id 6a3ddd83f1dcd7eb30bbcaf8 --mode ocr_only
 *   npm run process-blockcode-page -- --block-code 5010013 --file-name Binder1_Page_0157.jpg --mode full
 */

import { MongoClient } from 'mongodb';
import { loadEnv } from './load-env.mjs';
import {
  findBlockcodePage,
  processBlockcodeDocument,
  type ProcessDocumentMode,
} from '../src/lib/blockcode-document';

loadEnv();

interface CliOptions {
  pageId: string;
  blockCode: string;
  fileName: string;
  mode: ProcessDocumentMode;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    pageId: process.env.PAGE_ID || '',
    blockCode: process.env.BLOCK_CODE || '',
    fileName: process.env.FILE_NAME || '',
    mode: (process.env.MODE === 'ocr_only' ? 'ocr_only' : 'full') as ProcessDocumentMode,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--page-id' && next) {
      options.pageId = next;
      i += 1;
    } else if (arg === '--block-code' && next) {
      options.blockCode = next;
      i += 1;
    } else if (arg === '--file-name' && next) {
      options.fileName = next;
      i += 1;
    } else if (arg === '--mode' && next) {
      options.mode = next === 'ocr_only' ? 'ocr_only' : 'full';
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Process one blockcodes page directly (no local server required)

Usage:
  npm run process-blockcode-page -- [options]

Options:
  --page-id <id>         MongoDB _id of the blockcodes document
  --block-code <code>    Lookup with --file-name
  --file-name <name>     Lookup with --block-code
  --mode <mode>          ocr_only | full (default: full)

Modes:
  ocr_only   Run OCR, save ocr_data, and insert new voters (skip existing CNICs)
  full       Same as ocr_only, then mark page completed

Requires NEXT_PUBLIC_MONGODB_URI in .env.
Google Vision: GOOGLE_VISION_API_KEY in .env (preferred), or credentials.json / GOOGLE_VISION_*.

Examples:
  npm run process-blockcode-page -- --page-id 6a3ddd83f1dcd7eb30bbcaf8 --mode ocr_only
  npm run process-blockcode-page -- --block-code 5010013 --file-name Binder1_Page_0157.jpg --mode full
`);
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

  const uri = process.env.NEXT_PUBLIC_MONGODB_URI;
  if (!uri) {
    console.error('Error: NEXT_PUBLIC_MONGODB_URI is not set in .env');
    process.exit(1);
  }

  console.log(`Mode: ${options.mode}`);
  console.log('Running OCR directly (may take 30–90 seconds)...\n');

  const client = new MongoClient(uri);
  const startedAt = Date.now();

  try {
    await client.connect();
    const db = client.db('vdp');

    const document = await findBlockcodePage(db, {
      pageId: options.pageId,
      blockCode: options.blockCode,
      fileName: options.fileName,
    });

    if (!document) {
      console.error('Error: page not found');
      process.exit(1);
    }

    console.log(`Page: ${document.blockCode} / ${document.fileName}`);
    console.log(`Image: ${document.url?.slice(0, 80)}...\n`);

    const result = await processBlockcodeDocument(db, document, db, { mode: options.mode });
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

    console.log(`Status: ${result.page.status}`);
    console.log(`OCR saved: yes (${result.ocr_data.finalJson.length} voter rows parsed)`);

    if (result.voters) {
      console.log(
        `Voters: ${result.voters.saved} new, ${result.voters.errors} errors, ` +
          `${result.voters.duplicates} already exist, ${result.voters.skippedNoCnic} skipped (no CNIC)`
      );
    }

    console.log(`Completed in ${elapsed}s`);
  } catch (error) {
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('UNAUTHENTICATED') || message.includes('invalid_grant')) {
      console.error(`Failed (${elapsed}s): Google Vision authentication failed.`);
      console.error('Run: npm run test-google-vision');
      process.exit(1);
    }

    console.error(`Failed (${elapsed}s):`, message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();
