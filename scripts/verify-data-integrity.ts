#!/usr/bin/env node
/**
 * Verify local upload folders against MongoDB blockcodes and voters collections.
 *
 * Usage:
 *   npm run verify-data
 *   npm run verify-data -- --halka LA41 --folder /path/to/constituency
 *   npm run verify-data -- --halka LA41 --folder /path --export ./report.csv
 */

import fs from 'fs/promises';
import path from 'path';
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import Papa from 'papaparse';
import { loadEnv } from './load-env.mjs';
import type {
  BlockIntegrityRow,
  IntegrityReport,
} from '../src/lib/data-integrity';

loadEnv();

const argv = process.argv.slice(2);

interface CliOptions {
  halkaName: string;
  rootFolder: string;
  exportPath: string;
  help: boolean;
}

function printHelp(): void {
  console.log(`Data verification & integrity check

Compares local block-code folders with MongoDB blockcodes and voters.

Interactive:
  npm run verify-data

Non-interactive:
  npm run verify-data -- --halka LA41 --folder /path/to/constituency-folder
  npm run verify-data -- --halka LA41 --folder /path --export ./integrity-report.csv

Options:
  --halka <name>     Constituency halka name (e.g. LA41)
  --folder <path>    Root folder containing block-code subfolders
  --export <path>    Write full report to CSV after the run
  --help, -h         Show this help
`);
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    halkaName: '',
    rootFolder: '',
    exportPath: '',
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    switch (arg) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--halka':
        if (next) {
          options.halkaName = next.trim();
          index += 1;
        }
        break;
      case '--folder':
        if (next) {
          options.rootFolder = next.trim();
          index += 1;
        }
        break;
      case '--export':
        if (next) {
          options.exportPath = next.trim();
          index += 1;
        }
        break;
      default:
        break;
    }
  }

  return options;
}

async function promptForMissing(options: CliOptions): Promise<CliOptions> {
  const rl = readline.createInterface({ input, output });

  try {
    if (!options.halkaName) {
      const halka = await rl.question('Halka name: ');
      options.halkaName = halka.trim();
    }

    if (!options.rootFolder) {
      const folder = await rl.question('Path to main constituency folder: ');
      options.rootFolder = folder.trim();
    }

    const hasCliArgs = Boolean(
      argv.includes('--halka') && argv.includes('--folder')
    );
    if (!options.exportPath && !hasCliArgs) {
      const answer = await rl.question('Export CSV report? (y/N): ');
      if (answer.trim().toLowerCase() === 'y') {
        const exportPath = await rl.question('CSV output path (default: ./integrity-report.csv): ');
        options.exportPath = exportPath.trim() || './integrity-report.csv';
      }
    }

    return options;
  } finally {
    rl.close();
  }
}

function formatCell(value: string, width: number): string {
  if (value.length <= width) {
    return value.padEnd(width);
  }
  return `${value.slice(0, Math.max(0, width - 1))}…`;
}

function printTableHeader(): void {
  const header = [
    formatCell('Block code', 12),
    formatCell('Local files', 12),
    formatCell('DB pages', 10),
    formatCell('Voters', 10),
    formatCell('OCR done', 10),
    formatCell('Upload OK', 10),
    'Notes',
  ].join('  ');
  console.log(header);
  console.log('-'.repeat(header.length));
}

function printTableRow(row: BlockIntegrityRow): void {
  const uploadOk = !row.hasLocalFolder ? '—' : row.uploadMatch ? 'yes' : 'no';
  const line = [
    formatCell(row.blockCode, 12),
    formatCell(row.hasLocalFolder ? String(row.localFiles) : '—', 12),
    formatCell(String(row.dbPages), 10),
    formatCell(String(row.voters), 10),
    formatCell(String(row.ocrProcessed), 10),
    formatCell(uploadOk, 10),
    row.notes,
  ].join('  ');
  console.log(line);
}

function reportToCsvRows(report: IntegrityReport): Record<string, string | number | boolean>[] {
  return report.rows.map((row) => ({
    halkaName: report.halkaName,
    blockCode: row.blockCode,
    localFiles: row.localFiles,
    dbPages: row.dbPages,
    voters: row.voters,
    ocrProcessed: row.ocrProcessed,
    uploadMatch: row.uploadMatch,
    hasLocalFolder: row.hasLocalFolder,
    notes: row.notes,
  }));
}

async function writeCsvReport(report: IntegrityReport, exportPath: string): Promise<string> {
  const resolved = path.resolve(exportPath);
  const rows = reportToCsvRows(report);
  const csv = Papa.unparse(rows, { quotes: true });
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, `\uFEFF${csv}`, 'utf8');
  return resolved;
}

function logStatus(message: string): void {
  process.stdout.write(`${message}\n`);
}

async function main(): Promise<void> {
  let options = parseArgs(argv);

  if (options.help) {
    printHelp();
    return;
  }

  options = await promptForMissing(options);

  if (!options.halkaName) {
    console.error('Error: halka name is required.');
    process.exit(1);
  }

  if (!options.rootFolder) {
    console.error('Error: folder path is required.');
    process.exit(1);
  }

  const rootFolder = path.resolve(options.rootFolder);
  try {
    const stat = await fs.stat(rootFolder);
    if (!stat.isDirectory()) {
      throw new Error('not a directory');
    }
  } catch {
    console.error(`Error: folder not found or not readable: ${rootFolder}`);
    process.exit(1);
  }

  console.log(`\nVerifying ${options.halkaName} against ${rootFolder}`);

  const { connectMongoDb } = await import('../src/lib/mongo-client');
  const { buildIntegrityReport, summarizeIntegrityReport } = await import('../src/lib/data-integrity');

  logStatus('Connecting to MongoDB…');
  const { client, db } = await connectMongoDb('vdp');
  logStatus('Connected.');

  let tableStarted = false;
  const report = await buildIntegrityReport(db, {
    halkaName: options.halkaName,
    rootFolder,
    onStatus: (message) => {
      logStatus(message);
      if (!tableStarted && message.startsWith('Checking ')) {
        printTableHeader();
        tableStarted = true;
      }
    },
    onRow: (row) => {
      printTableRow(row);
    },
  });

  process.stdout.write(`\nChecked ${report.rows.length} block code(s).\n`);

  const summary = summarizeIntegrityReport(report);
  console.log('\nSummary');
  console.log(`  Block codes checked: ${summary.totalBlockCodes}`);
  console.log(`  Upload mismatches:   ${summary.uploadMismatches}`);
  console.log(`  Missing local dirs: ${summary.missingFolders}`);
  console.log(`  Blocks with no voters: ${summary.emptyVoterBlocks}`);
  console.log(`  Blocks with incomplete OCR: ${summary.incompleteOcr}`);

  if (options.exportPath) {
    const written = await writeCsvReport(report, options.exportPath);
    console.log(`\nCSV report saved: ${written}`);
  }

  await client.close();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
