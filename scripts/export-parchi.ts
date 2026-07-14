#!/usr/bin/env node
/**
 * Export voter parchi PDFs for a full constituency.
 *
 * Modes:
 *   --mode combined   One PDF for the whole constituency (merged from batches)
 *   --mode per-block  One PDF per block code
 *
 * Pause with Ctrl+C (waits for the current batch). Resume with --resume <jobId>.
 */

import path from 'path';
import { loadEnv } from './load-env.mjs';

const argv = process.argv.slice(2);

const HELP = `
Export constituency voter parchi PDFs

Usage:
  npm run export-parchi -- --halka LA39 --mode combined --all-blockcodes --out ./parchi
  npm run export-parchi -- --halka LA39 --mode per-block --all-blockcodes --out ./parchi
  npm run export-parchi -- --halka LA39 --mode per-block --block-codes 0070003,0179004 --out ./parchi
  npm run export-parchi -- --list
  npm run export-parchi -- --resume <jobId>
  npm run export-parchi -- --help

Options:
  --halka <name>              Constituency / halka (required for new jobs)
  --mode <combined|per-block> Output layout (default: combined)
  --all-blockcodes            Include every block code for the halka
  --block-codes <a,b,c>       Limit to specific block codes
  --gender <both|male|female> Gender filter (default: both)
  --design <id>               Parchi design ObjectId (default: constituency default)
  --batch-size <n>            Voters per batch for --mode combined (default: 30, max: 120)
  --out <dir>                 Optional extra copy of final PDF(s) (server always keeps them)
  --list                      List recent CLI export jobs
  --resume <jobId>            Resume a paused / failed job
  --help                      Show this help

Storage:
  --mode per-block uses the same web console job pipeline. PDFs are saved under
  data/voter-parchi/{jobId}/ and registered in voter_parchi_latest so the
  dashboard can download them. --out only adds an optional local copy.

Pause / resume:
  Press Ctrl+C to pause after the current batch finishes.
  Resume later with: npm run export-parchi -- --resume <jobId>
`.trim();

if (argv.includes('--help') || argv.includes('-h')) {
  console.log(HELP);
  process.exit(0);
}

loadEnv();

interface CliOptions {
  halka: string;
  mode: 'combined' | 'per-block';
  blockCodes: string[];
  allBlockCodes: boolean;
  genderFilter: 'both' | 'male' | 'female';
  designId: string;
  batchSize: number;
  outputDir: string;
  resumeJobId: string;
  listJobs: boolean;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    halka: '',
    mode: 'combined',
    blockCodes: [],
    allBlockCodes: false,
    genderFilter: 'both',
    designId: '',
    batchSize: 30,
    outputDir: '',
    resumeJobId: '',
    listJobs: false,
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
          options.halka = next.trim();
          index += 1;
        }
        break;
      case '--mode':
        if (next === 'combined' || next === 'per-block') {
          options.mode = next;
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
      case '--gender':
        if (next === 'both' || next === 'male' || next === 'female') {
          options.genderFilter = next;
          index += 1;
        }
        break;
      case '--design':
        if (next) {
          options.designId = next.trim();
          index += 1;
        }
        break;
      case '--batch-size':
        if (next) {
          const parsed = Number.parseInt(next, 10);
          if (Number.isFinite(parsed)) options.batchSize = parsed;
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
          options.resumeJobId = next.trim();
          index += 1;
        }
        break;
      default:
        break;
    }
  }

  return options;
}

class ProgressBar {
  private lastLine = '';

  message(text: string) {
    process.stdout.write(`\r\x1b[K${text}`);
    this.lastLine = text;
  }

  render(job: {
    progressPercent: number;
    processedVoters: number;
    totalVoters: number;
    halkaName: string;
    mode: string;
    currentBlockCode: string | null;
    finalFiles: unknown[];
    status: string;
  }) {
    const width = 40;
    const pct = job.progressPercent;
    const filled = Math.min(width, Math.round((pct / 100) * width));
    const bar =
      '='.repeat(filled) +
      (filled < width ? '>' : '') +
      ' '.repeat(Math.max(0, width - filled - (filled < width ? 1 : 0)));
    const block = job.currentBlockCode ? ` · block ${job.currentBlockCode}` : '';
    const files = job.finalFiles.length ? ` · ${job.finalFiles.length} pdf` : '';
    const line = `[${bar}] ${String(pct).padStart(3)}% | ${job.processedVoters}/${job.totalVoters} voters | ${job.halkaName} · ${job.mode}${block}${files}`;

    if (line !== this.lastLine) {
      process.stdout.write(`\r\x1b[K${line}`);
      this.lastLine = line;
    }
  }

  finish() {
    process.stdout.write('\n');
  }
}

async function main() {
  const {
    createParchiCliExportJob,
    listParchiCliExportJobs,
    resumeParchiCliExportJob,
    runParchiCliExportUntilComplete,
  } = await import('../src/lib/voter-parchi/cli-export');

  const options = parseArgs(argv);
  const progress = new ProgressBar();

  if (options.listJobs) {
    const jobs = await listParchiCliExportJobs(30);
    if (!jobs.length) {
      console.log('No parchi CLI export jobs found.');
      return;
    }
    for (const job of jobs) {
      console.log(
        `${job._id}  ${job.status.padEnd(10)}  ${job.processedVoters}/${job.totalVoters}  ${job.halkaName}  ${job.mode}`
      );
      if (job.error) console.log(`  error: ${job.error}`);
      for (const file of job.finalFiles) {
        console.log(`  file: ${file.localPath} (${file.voterCount} voters)`);
      }
    }
    return;
  }

  let pauseRequested = false;
  const onSignal = () => {
    if (pauseRequested) return;
    pauseRequested = true;
    progress.finish();
    console.log('\nPause requested — finishing current batch, then saving state...');
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  let jobId = options.resumeJobId;

  if (!jobId) {
    if (!options.halka) {
      console.error('Error: --halka is required (or use --resume <jobId>).');
      console.error('Run: npm run export-parchi -- --help');
      process.exit(1);
    }
    if (!options.allBlockCodes && !options.blockCodes.length) {
      console.error('Error: specify --block-codes or --all-blockcodes.');
      process.exit(1);
    }

    progress.message(`Creating ${options.mode} parchi export for ${options.halka}...`);
    const job = await createParchiCliExportJob({
      halkaName: options.halka,
      mode: options.mode,
      blockCodes: options.blockCodes,
      allBlockCodes: options.allBlockCodes,
      genderFilter: options.genderFilter,
      designId: options.designId || undefined,
      batchSize: options.batchSize,
      outputDir: options.outputDir || undefined,
    });
    jobId = job._id;
    progress.finish();
    console.log(`Created job ${jobId}`);
    console.log(`Halka: ${job.halkaName}`);
    console.log(`Mode: ${job.mode}`);
    console.log(`Block codes: ${job.blockCodes.length}`);
    console.log(`Voters: ${job.totalVoters}`);
    console.log(`Design: ${job.designName}`);
    console.log(`Batch size: ${job.batchSize}`);
    if (job.mode === 'per-block') {
      console.log('Storage: server data/voter-parchi + voter_parchi_latest (same as web console)');
    }
    if (job.outputDir) {
      console.log(`Optional copy: ${job.outputDir}`);
    }
    console.log('Press Ctrl+C to pause after the current batch.');
  } else {
    const resumed = await resumeParchiCliExportJob(jobId);
    if (!resumed) {
      console.error(`Job not found: ${jobId}`);
      process.exit(1);
    }
    console.log(
      `Resuming job ${jobId} (${resumed.status}) — ${resumed.processedVoters}/${resumed.totalVoters} voters`
    );
  }

  progress.message('Starting...');
  const finalJob = await runParchiCliExportUntilComplete(jobId, {
    onProgress: (job) => progress.render(job),
    shouldPause: () => pauseRequested,
  });
  progress.finish();

  process.off('SIGINT', onSignal);
  process.off('SIGTERM', onSignal);

  if (!finalJob) {
    console.error('Job not found.');
    process.exit(1);
  }

  if (finalJob.status === 'paused') {
    console.log(`Paused at ${finalJob.processedVoters}/${finalJob.totalVoters} voters.`);
    console.log(`Resume with: npm run export-parchi -- --resume ${finalJob._id}`);
    return;
  }

  if (finalJob.status === 'completed') {
    console.log('Export completed.');
    if (finalJob.mode === 'per-block') {
      console.log('PDFs are available in the web console (block table → voter parchi icon).');
    }
    for (const file of finalJob.finalFiles) {
      console.log(`  ${file.localPath} — ${file.voterCount} voters · ${file.pageCount} pages`);
    }
    return;
  }

  console.error(`Export ended with status: ${finalJob.status}`);
  if (finalJob.error) console.error(finalJob.error);
  process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
