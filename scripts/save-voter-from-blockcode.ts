#!/usr/bin/env node
/**
 * Save voter row(s) from blockcodes OCR data into the voters collection.
 *
 * Usage:
 *   npm run save-voter -- --cnic 61101-1939474-2
 *   npm run save-voter -- --cnic 61101-1939474-2 --page-id 6a3e3d21c422c0d30208b1df
 *   npm run save-voter -- --cnic 61101-1939474-2 --block-code 5100061 --file-name Binder1_Page_0399.jpg
 *   npm run save-voter -- --page-id 6a3e3d21c422c0d30208b1df --all
 */

import { MongoClient } from 'mongodb';
import { loadEnv } from './load-env.mjs';
import { findBlockcodePage } from '../src/lib/blockcode-document';
import {
  findBlockcodePageByCnic,
  saveAllVotersFromBlockcode,
  saveVoterFromBlockcodeByCnic,
} from '../src/lib/voter-document';

loadEnv();

interface CliOptions {
  cnic: string;
  halkaName: string;
  pageId: string;
  blockCode: string;
  fileName: string;
  all: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    cnic: process.env.CNIC || '',
    halkaName: process.env.HALKA_NAME || '',
    pageId: process.env.PAGE_ID || '',
    blockCode: process.env.BLOCK_CODE || '',
    fileName: process.env.FILE_NAME || '',
    all: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--cnic' && next) {
      options.cnic = next;
      i += 1;
    } else if (arg === '--halka' && next) {
      options.halkaName = next;
      i += 1;
    } else if (arg === '--page-id' && next) {
      options.pageId = next;
      i += 1;
    } else if (arg === '--block-code' && next) {
      options.blockCode = next;
      i += 1;
    } else if (arg === '--file-name' && next) {
      options.fileName = next;
      i += 1;
    } else if (arg === '--all') {
      options.all = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Save voter row(s) from blockcodes OCR into voters collection

Usage:
  npm run save-voter -- [options]

Options:
  --cnic <cnic>          CNIC to save or update (XXXXX-XXXXXXX-X)
  --halka <name>         Halka name when locating page by CNIC (e.g. LA39)
  --page-id <id>         Blockcodes page _id (optional if CNIC is unique in OCR data)
  --block-code <code>    Lookup page with --file-name
  --file-name <name>     Lookup page with --block-code
  --all                  Save every voter row on the page (requires --page-id or block lookup)
  --help, -h             Show this help

Behavior:
  - Reads ocr_data from blockcodes (voterTableRows / vision annotations).
  - --all inserts only CNICs not already in voters for the same halka (skips existing).
  - --cnic upserts that voter in the page halka (insert or update by cnic + halkaName).

Examples:
  npm run save-voter -- --cnic 61101-1939474-2
  npm run save-voter -- --cnic 61101-1939474-2 --page-id 6a3e3d21c422c0d30208b1df
  npm run save-voter -- --page-id 6a3e3d21c422c0d30208b1df --all

Requires NEXT_PUBLIC_MONGODB_URI in .env.
Page must already have ocr_data (run: npm run process-blockcode-page -- --page-id <id> --mode ocr_only).
`);
}

function formatUpsertResult(result: { cnic: string; upserted: boolean; modified: boolean }) {
  const action = result.upserted ? 'inserted' : result.modified ? 'updated' : 'unchanged';
  return `${result.cnic}: ${action}`;
}

async function resolvePage(db: import('mongodb').Db, options: CliOptions) {
  if (options.pageId || (options.blockCode && options.fileName)) {
    const document = await findBlockcodePage(db, {
      pageId: options.pageId,
      blockCode: options.blockCode,
      fileName: options.fileName,
    });
    if (!document) {
      throw new Error('Page not found');
    }
    return document;
  }

  if (options.cnic) {
    const document = await findBlockcodePageByCnic(db, options.cnic, options.halkaName || undefined);
    if (!document) {
      const halkaHint = options.halkaName ? ` in halka ${options.halkaName}` : '';
      throw new Error(`No blockcodes page with OCR data containing CNIC ${options.cnic}${halkaHint}`);
    }
    return document;
  }

  throw new Error('Provide --page-id or --block-code + --file-name, or --cnic to locate the page');
}

function formatVoterStats(stats: {
  saved: number;
  errors: number;
  duplicates: number;
  skippedNoCnic: number;
}) {
  return `${stats.saved} new, ${stats.duplicates} already exist, ${stats.errors} errors, ${stats.skippedNoCnic} skipped (no CNIC)`;
}

async function main() {
  const options = parseArgs(process.argv);

  if (!options.all && !options.cnic) {
    console.error('Error: provide --cnic or --all with a page locator');
    printHelp();
    process.exit(1);
  }

  if (options.all && !options.pageId && !(options.blockCode && options.fileName)) {
    console.error('Error: --all requires --page-id or both --block-code and --file-name');
    process.exit(1);
  }

  const uri = process.env.NEXT_PUBLIC_MONGODB_URI;
  if (!uri) {
    console.error('Error: NEXT_PUBLIC_MONGODB_URI is not set in .env');
    process.exit(1);
  }

  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db('vdp');
    const document = await resolvePage(db, options);

    console.log(`Page: ${document.blockCode} / ${document.fileName} (${document._id})`);
    console.log(`Halka: ${document.halkaName}`);

    if (!document.ocr_data) {
      console.error('Error: page has no ocr_data. Run OCR first:');
      console.error(`  npm run process-blockcode-page -- --page-id ${document._id} --mode ocr_only`);
      process.exit(1);
    }

    if (options.all) {
      const stats = await saveAllVotersFromBlockcode(db, document);
      console.log(`\nVoters: ${formatVoterStats(stats)}`);
      return;
    }

    const result = await saveVoterFromBlockcodeByCnic(db, document, options.cnic);
    console.log(`\n${formatUpsertResult(result)}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();
