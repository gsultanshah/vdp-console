#!/usr/bin/env node
/**
 * Export voters to CSV/XLSX from the command line.
 *
 * Usage:
 *   npm run export-voters -- --halka LA39 --all-blockcodes --mode default --format xlsx
 *   npm run export-voters -- --halka LA39 --block-codes 1160010,1160011 --fields name,cnic,phone
 *   npm run export-voters -- --resume 674a1b2c3d4e5f6789012345
 *   npm run export-voters -- --list
 *   npm run export-voters -- --halka LA39 --all-blockcodes --out ./exports
 */

import path from 'path';
import { loadEnv } from './load-env.mjs';
import {
  DEFAULT_EXPORT_FIELD_IDS,
  EXPORT_FIELD_DEFINITIONS,
  MAX_EXPORT_FILE_MB,
  type ExportFormat,
  type ExportMode,
} from '../src/lib/export-fields';
import {
  copyExportFilesToDir,
  createExportJob,
  listExportJobs,
  resumeExportJob,
  runExportUntilComplete,
  type ExportJobSummary,
} from '../src/lib/voter-export';

loadEnv();

interface CliOptions {
  halkas: string[];
  blockCodes: string[];
  allBlockCodes: boolean;
  fields: string[];
  format: ExportFormat;
  mode: ExportMode;
  resumeJobId: string;
  listJobs: boolean;
  outputDir: string;
  help: boolean;
}

function printHelp() {
  const fieldList = EXPORT_FIELD_DEFINITIONS.map((field) => field.id).join(', ');
  console.log(`Export voters (max ${MAX_EXPORT_FILE_MB} MB per file)

Usage:
  npm run export-voters -- --halka LA39 [options]
  npm run export-voters -- --resume <jobId>
  npm run export-voters -- --list

Options:
  --halka <names>         Comma-separated constituency halka names (required for new export)
  --block-codes <codes>   Comma-separated block codes (custom mode)
  --all-blockcodes        Export all block codes in selected halka(s)
  --fields <ids>          Comma-separated fields (default: name,cnic,phone)
  --format <csv|xlsx>     Output format (default: csv)
  --mode <custom|default> custom = single file, default = one file per block code
  --out <dir>             Copy finished files to this directory
  --resume <jobId>        Resume a previous export job
  --list                  List recent export jobs
  --help                  Show this help

Available fields: ${fieldList}
`);
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    halkas: [],
    blockCodes: [],
    allBlockCodes: false,
    fields: [...DEFAULT_EXPORT_FIELD_IDS],
    format: 'csv',
    mode: 'custom',
    resumeJobId: '',
    listJobs: false,
    outputDir: '',
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    switch (arg) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--list':
        options.listJobs = true;
        break;
      case '--all-blockcodes':
        options.allBlockCodes = true;
        break;
      case '--halka':
        if (next) {
          options.halkas.push(
            ...next
              .split(',')
              .map((value) => value.trim())
              .filter(Boolean)
          );
          index += 1;
        }
        break;
      case '--block-codes':
        if (next) {
          options.blockCodes.push(
            ...next
              .split(',')
              .map((value) => value.trim())
              .filter(Boolean)
          );
          index += 1;
        }
        break;
      case '--fields':
        if (next) {
          options.fields = next
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean);
          index += 1;
        }
        break;
      case '--format':
        if (next === 'csv' || next === 'xlsx') {
          options.format = next;
          index += 1;
        }
        break;
      case '--mode':
        if (next === 'custom' || next === 'default') {
          options.mode = next === 'default' ? 'default_per_blockcode' : 'custom';
          index += 1;
        }
        break;
      case '--out':
        if (next) {
          options.outputDir = next;
          index += 1;
        }
        break;
      case '--resume':
        if (next) {
          options.resumeJobId = next;
          index += 1;
        }
        break;
      default:
        break;
    }
  }

  if (options.allBlockCodes || options.mode === 'default_per_blockcode') {
    options.allBlockCodes = true;
  }

  return options;
}

class ProgressBar {
  private lastLine = '';

  render(job: ExportJobSummary) {
    const width = 36;
    const pct = job.progressPercent;
    const filled = Math.min(width, Math.round((pct / 100) * width));
    const bar =
      '='.repeat(filled) +
      (filled < width ? '>' : '') +
      ' '.repeat(Math.max(0, width - filled - (filled < width ? 1 : 0)));
    const block = job.currentBlockCode ? ` block ${job.currentBlockCode}` : '';
    const line = `[${bar}] ${pct}% | ${job.processedVoters}/${job.totalVoters} voters | ${job.status}${block}`;

    if (line !== this.lastLine) {
      process.stdout.write(`\r\x1b[K${line}`);
      this.lastLine = line;
    }
  }

  finish() {
    process.stdout.write('\n');
  }
}

function printJobList(jobs: ExportJobSummary[]) {
  if (!jobs.length) {
    console.log('No export jobs found.');
    return;
  }

  for (const job of jobs) {
    console.log(`${job._id}  ${job.status.padEnd(14)}  ${job.processedVoters}/${job.totalVoters}  ${job.halkaNames.join(',')}  ${job.mode}`);
    if (job.error) {
      console.log(`  error: ${job.error}`);
    }
    for (const file of job.outputFiles) {
      console.log(`  file: ${file.fileName} (${file.rowCount} rows)`);
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  if (options.listJobs) {
    const jobs = await listExportJobs(20);
    printJobList(jobs);
    return;
  }

  let jobId = options.resumeJobId;

  if (!jobId) {
    if (!options.halkas.length) {
      console.error('Error: --halka is required for a new export (or use --resume <jobId>).');
      printHelp();
      process.exit(1);
    }

    if (!options.allBlockCodes && !options.blockCodes.length) {
      console.error('Error: specify --block-codes or --all-blockcodes.');
      process.exit(1);
    }

    const job = await createExportJob({
      halkaNames: options.halkas,
      blockCodes: options.blockCodes,
      selectAllBlockCodes: options.allBlockCodes,
      fields: options.mode === 'default_per_blockcode' ? DEFAULT_EXPORT_FIELD_IDS : options.fields,
      format: options.format,
      mode: options.mode,
      createdBy: 'cli@export',
      createdByName: 'CLI export',
    });

    jobId = job._id;
    console.log(`Created export job ${jobId}`);
    console.log(`Halka: ${job.halkaNames.join(', ')}`);
    console.log(`Block codes: ${job.blockCodes.length}`);
    console.log(`Mode: ${job.mode} · Format: ${job.format}`);
    console.log(`Max file size: ${MAX_EXPORT_FILE_MB} MB`);
  } else {
    const resumed = await resumeExportJob(jobId);
    if (!resumed) {
      console.error(`Export job not found: ${jobId}`);
      process.exit(1);
    }
    console.log(`Resuming export job ${jobId}`);
  }

  const progress = new ProgressBar();
  const finalJob = await runExportUntilComplete(jobId, (job) => progress.render(job));
  progress.finish();

  if (!finalJob) {
    console.error('Export job not found.');
    process.exit(1);
  }

  if (finalJob.status === 'completed') {
    console.log('Export completed.');
    for (const file of finalJob.outputFiles) {
      console.log(`  ${file.fileName} — ${file.rowCount} rows`);
    }

    if (options.outputDir) {
      const copied = await copyExportFilesToDir(jobId, path.resolve(options.outputDir));
      console.log(`Copied ${copied.length} file(s) to ${path.resolve(options.outputDir)}`);
    } else {
      console.log(`Files saved under data/exports/${jobId}/`);
    }
    return;
  }

  console.error(`Export ended with status: ${finalJob.status}`);
  if (finalJob.error) {
    console.error(finalJob.error);
  }
  process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
