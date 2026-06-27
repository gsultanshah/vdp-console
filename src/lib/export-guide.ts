import {
  DEFAULT_EXPORT_FIELD_IDS,
  EXPORT_FIELD_DEFINITIONS,
  EXPORT_FILE_SIZE_UI_MB,
  MAX_EXPORT_FILE_MB,
} from '@/lib/export-fields';

export interface ExportGuideSection {
  title: string;
  lines: string[];
}

export const EXPORT_GUIDE_SECTIONS: ExportGuideSection[] = [
  {
    title: 'Overview',
    lines: [
      'Export voter records from MongoDB to CSV or XLSX.',
      'Phone numbers are looked up by CNIC from the phone data service when the phone field is included.',
      'Exports run in batches with progress tracking. Jobs are stored in MongoDB so they can be resumed after interruption.',
      `Each output file is limited to ${MAX_EXPORT_FILE_MB} MB. If a file exceeds this limit, that block stops and the job reports a size error.`,
    ],
  },
  {
    title: 'Who can export',
    lines: [
      'Web UI: Data Processing → Export tab — admin users only.',
      'CLI: runs on the server with direct database access (no login required). Use on trusted machines only.',
    ],
  },
  {
    title: 'Export modes',
    lines: [
      'Custom — one combined file for all selected block codes. Choose your own fields.',
      'Default — one file per block code across selected constituencies. Uses name, CNIC, and phone only. Each file is named after its block code (e.g. 1160010.csv).',
    ],
  },
  {
    title: 'Fields',
    lines: [
      `Default fields: ${DEFAULT_EXPORT_FIELD_IDS.join(', ')}.`,
      'Available fields:',
      ...EXPORT_FIELD_DEFINITIONS.map(
        (field) =>
          `  • ${field.id} — ${field.label}${field.default ? ' (default)' : ''}`
      ),
      'Phone values are semicolon-separated when a CNIC has multiple numbers.',
    ],
  },
  {
    title: 'Web UI workflow',
    lines: [
      '1. Open Data Processing → Export.',
      '2. Select one or more constituencies (halka names).',
      '3. In custom mode: search and select block codes, or use Select all.',
      '4. Choose fields, format (CSV/XLSX), and export mode.',
      '5. Click Run export or Run default export.',
      '6. Watch the progress bar. Download files when complete.',
      '7. To continue a stopped job: Previous exports → Resume.',
    ],
  },
  {
    title: 'CLI command',
    lines: [
      'npm run export-voters -- [options]',
      '',
      'Requires .env with NEXT_PUBLIC_MONGODB_URI (and AWS credentials if exporting phone numbers).',
    ],
  },
  {
    title: 'CLI options',
    lines: [
      '  --halka <names>         Comma-separated halka names (required for new export)',
      '  --block-codes <codes>   Comma-separated block codes (custom mode)',
      '  --all-blockcodes        All block codes in the selected halka(s)',
      '  --fields <ids>          Comma-separated field ids (default: name,cnic,phone)',
      '  --format <csv|xlsx>     Output format (default: csv)',
      '  --mode <custom|default> custom = single file; default = one file per block code',
      '  --out <dir>             Copy finished files to this directory',
      '  --resume <jobId>        Resume a previous export job',
      '  --list                  List recent export jobs',
      '  --help, -h              Show this guide',
    ],
  },
  {
    title: 'CLI examples',
    lines: [
      '# Default export: all block codes in LA39, one XLSX per block code',
      'npm run export-voters -- --halka LA39 --all-blockcodes --mode default --format xlsx',
      '',
      '# Custom export: specific block codes, selected fields, CSV',
      'npm run export-voters -- --halka LA39 --block-codes 1160010,1160011 --fields name,cnic,phone,address',
      '',
      '# Multiple constituencies',
      'npm run export-voters -- --halka LA39,LA40 --all-blockcodes --mode default',
      '',
      '# Copy output to a folder when done',
      'npm run export-voters -- --halka LA39 --all-blockcodes --out ./exports',
      '',
      '# List and resume jobs',
      'npm run export-voters -- --list',
      'npm run export-voters -- --resume 674a1b2c3d4e5f6789012345',
    ],
  },
  {
    title: 'Output locations',
    lines: [
      'Web UI downloads files via the browser from the API.',
      'CLI and server jobs write files to: data/exports/<jobId>/',
      'Use --out <dir> on the CLI to copy completed files elsewhere.',
    ],
  },
  {
    title: 'Resume and job status',
    lines: [
      'Statuses: pending, running, completed, failed, size_exceeded, cancelled.',
      'Jobs with status pending, running, or failed can be resumed.',
      'Resume continues from the last saved checkpoint (per block code in default mode).',
      'Stale running jobs (no update for 5 minutes) can be picked up again.',
    ],
  },
  {
    title: 'Troubleshooting',
    lines: [
      `File too large — reduce block codes, fields, or split by block code (default mode). Limit is ${MAX_EXPORT_FILE_MB} MB per file.`,
      'No phone numbers — check AWS/DynamoDB configuration in .env and services config.',
      'MongoExpiredSessionError — fixed in current code; update and resume the job.',
      'Empty export — verify voters exist for the selected halka and block codes.',
      'CLI cannot connect — ensure NEXT_PUBLIC_MONGODB_URI is set in .env.',
    ],
  },
];

export function formatExportCliHelp(): string {
  const lines: string[] = [
    'VDP Console — Voter export guide',
    '='.repeat(40),
    '',
  ];

  for (const section of EXPORT_GUIDE_SECTIONS) {
    lines.push(section.title);
    lines.push('-'.repeat(section.title.length));
    lines.push(...section.lines);
    lines.push('');
  }

  lines.push(`Maximum file size: ${MAX_EXPORT_FILE_MB} MB per output file.`);

  return lines.join('\n');
}
