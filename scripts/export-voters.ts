#!/usr/bin/env node
/**
 * Export voters to CSV/XLSX from the command line.
 * Run with --help for the full guide.
 */

import path from 'path';
import { loadEnv } from './load-env.mjs';
import { formatExportCliHelp } from '../src/lib/export-guide';
import {
  DEFAULT_EXPORT_FIELD_IDS,
  MAX_EXPORT_FILE_MB,
  type ExportFormat,
  type ExportMode,
} from '../src/lib/export-fields';
import type { ExportJobSummary } from '../src/lib/voter-export';

const argv = process.argv.slice(2);

if (argv.includes('--help') || argv.includes('-h')) {
  console.log(formatExportCliHelp());
  process.exit(0);
}

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
}

function parseArgs(args: string[]): CliOptions {
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
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    switch (arg) {
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
    console.log(
      `${job._id}  ${job.status.padEnd(14)}  ${job.processedVoters}/${job.totalVoters}  ${job.halkaNames.join(',')}  ${job.mode}`
    );
    if (job.error) {
      console.log(`  error: ${job.error}`);
    }
    for (const file of job.outputFiles) {
      console.log(`  file: ${file.fileName} (${file.rowCount} rows)`);
    }
  }
}

async function main() {
  const {
    copyExportFilesToDir,
    createExportJob,
    listExportJobs,
    resumeExportJob,
    runExportUntilComplete,
  } = await import('../src/lib/voter-export');

  const options = parseArgs(argv);

  if (options.listJobs) {
    const jobs = await listExportJobs(20);
    printJobList(jobs);
    return;
  }

  let jobId = options.resumeJobId;

  if (!jobId) {
    if (!options.halkas.length) {
      console.error('Error: --halka is required for a new export (or use --resume <jobId>).');
      console.error('Run: npm run export-voters -- --help');
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
