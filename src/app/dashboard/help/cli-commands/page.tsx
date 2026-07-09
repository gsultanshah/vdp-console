'use client';

import { CodeBlock, HelpLink, HelpPageHeader, Section } from '@/components/help/HelpDoc';

function CommandTable({ rows }: { rows: [string, string][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead>
          <tr>
            <th className="py-2 pr-4 text-left font-semibold text-gray-900">Command</th>
            <th className="py-2 text-left font-semibold text-gray-900">Description</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map(([cmd, desc]) => (
            <tr key={cmd}>
              <td className="py-2 pr-4 font-mono text-xs text-indigo-700 whitespace-nowrap sm:text-sm">
                {cmd}
              </td>
              <td className="py-2 text-gray-600">{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CliCommandsHelpPage() {
  return (
    <div className="space-y-8">
      <HelpPageHeader
        title="CLI Commands"
        description="Command-line scripts for OCR, voter processing, enrichment, and batch operations. Run from the vdp-console project root."
      />

      <Section title="Prerequisites">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <code className="rounded bg-gray-100 px-1">.env</code> in project root with{' '}
            <code className="rounded bg-gray-100 px-1">NEXT_PUBLIC_MONGODB_URI</code>
          </li>
          <li>
            Google Vision credentials for OCR commands:{' '}
            <code className="rounded bg-gray-100 px-1">GOOGLE_VISION_API_KEY</code> (preferred), or{' '}
            <code className="rounded bg-gray-100 px-1">credentials.json</code> /{' '}
            <code className="rounded bg-gray-100 px-1">GOOGLE_VISION_*</code>
          </li>
          <li>
            Test Vision auth:{' '}
            <code className="rounded bg-gray-100 px-1">npm run test-google-vision</code>
          </li>
          <li>
            Commands using <code className="rounded bg-gray-100 px-1">:local</code> require{' '}
            <code className="rounded bg-gray-100 px-1">npm run dev</code> in another terminal
          </li>
        </ul>
        <p className="mt-2 text-gray-500">
          Append <code className="rounded bg-gray-100 px-1">-- --help</code> to any script for full
          CLI options (e.g. <code className="rounded bg-gray-100 px-1">npm run process-ocr -- --help</code>).
        </p>
      </Section>

      <Section title="Recommended pipeline">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Upload images — <HelpLink href="/dashboard/help/vdp-uploader">VDP Image Uploader</HelpLink>
          </li>
          <li>
            Tag title pages — <code className="rounded bg-gray-100 px-1">npm run mark-title-pages:local -- --halka LA39</code>
          </li>
          <li>
            Run OCR (save <code className="rounded bg-gray-100 px-1">ocr_data</code>) —{' '}
            <code className="rounded bg-gray-100 px-1">npm run process-ocr -- --halka LA39</code>
          </li>
          <li>
            Process voters (OCR + insert new CNICs) —{' '}
            <code className="rounded bg-gray-100 px-1">npm run process-voters:local -- --halka LA39</code>
          </li>
          <li>
            Enrich existing voters (reproduction + row crop) —{' '}
            <code className="rounded bg-gray-100 px-1">npm run enrich-voters -- --halka LA39</code>
          </li>
          <li>
            Verify in <HelpLink href="/dashboard/search-voters">Search Voters</HelpLink>
          </li>
          <li>
            Check counts against local files —{' '}
            <code className="rounded bg-gray-100 px-1">npm run verify-data -- --halka LA39 --folder /path/to/LA39</code>
          </li>
          <li>
            Export voters —{' '}
            <code className="rounded bg-gray-100 px-1">npm run export-voters -- --halka LA39 --all-blockcodes --format xlsx --out ./exports</code>
          </li>
        </ol>
      </Section>

      <Section title="OCR — single page">
        <p>
          Run Google Vision OCR directly on one blockcodes page (no dev server). Saves{' '}
          <code className="rounded bg-gray-100 px-1">ocr_data</code> on the blockcodes document and
          inserts new voters (skips CNICs already in the same halka).
        </p>
        <CommandTable
          rows={[
            ['npm run process-blockcode-page -- --page-id <id> --mode ocr_only', 'OCR only — save ocr_data + insert new voters'],
            ['npm run process-blockcode-page -- --page-id <id> --mode full', 'OCR + insert voters + mark page completed'],
            [
              'npm run process-blockcode-page -- --block-code 0070003 --file-name Binder1_Page_3423.jpg --mode ocr_only',
              'Lookup page by block code + file name',
            ],
          ]}
        />
        <p className="mt-4 font-medium text-gray-900">Examples</p>
        <CodeBlock>{`npm run process-blockcode-page -- --page-id 6a3dc159ff6dcb2912171197 --mode ocr_only
npm run process-blockcode-page -- --block-code 1180001 --file-name Binder1_Page_1737.jpg --mode full`}</CodeBlock>
      </Section>

      <Section title="OCR — batch (parallel)">
        <p>
          OCR all pages in a halka in parallel. No dev server required. Each page gets{' '}
          <code className="rounded bg-gray-100 px-1">ocr_data</code> and new voters are inserted.
        </p>
        <CommandTable
          rows={[
            ['npm run process-ocr -- --halka LA39 --parallel 20', 'OCR all pending pages in halka'],
            ['npm run process-ocr -- --halka LA39 --block-code 1180001', 'Limit to one block code'],
            ['npm run process-ocr -- --halka LA39 --block-codes 1180001,1180002', 'Comma-separated block codes'],
            ['npm run process-ocr -- --halka LA39 --force --parallel 10', 'Re-run OCR even when ocr_data exists'],
            ['npm run process-ocr -- --halka LA39 --release-claims', 'Clear stuck in-flight OCR claims'],
          ]}
        />
        <CodeBlock>{`npm run process-ocr -- --halka LA39 --parallel 20
npm run process-ocr -- --halka LA39 --block-codes 0070003,5100061 --parallel 10`}</CodeBlock>
      </Section>

      <Section title="Save voter — single CNIC">
        <p>
          Save or update one voter from existing <code className="rounded bg-gray-100 px-1">ocr_data</code>{' '}
          on a blockcodes page. Includes reproduction data and row crop fields (
          <code className="rounded bg-gray-100 px-1">rowY</code>,{' '}
          <code className="rounded bg-gray-100 px-1">rowHeight</code>,{' '}
          <code className="rounded bg-gray-100 px-1">reproduction</code>).
        </p>
        <CommandTable
          rows={[
            ['npm run save-voter -- --cnic 37404-2611137-4', 'Find page by CNIC in OCR data, upsert voter'],
            ['npm run save-voter -- --cnic 37404-2611137-4 --halka LA39', 'Scope page lookup to halka'],
            ['npm run save-voter -- --cnic 37404-2611137-4 --page-id <id>', 'Specific blockcodes page'],
            [
              'npm run save-voter -- --page-id <id> --all',
              'Insert all new CNICs from page (skip existing in halka)',
            ],
          ]}
        />
        <CodeBlock>{`npm run save-voter -- --cnic 37404-2611137-4 --halka LA39
npm run save-voter -- --page-id 6a3dd119f1dcd7eb30bbc630 --all`}</CodeBlock>
        <p className="mt-2 text-gray-500">
          Page must already have <code className="rounded bg-gray-100 px-1">ocr_data</code>. Voter
          identity is <code className="rounded bg-gray-100 px-1">cnic + halkaName</code>.
        </p>
      </Section>

      <Section title="Enrich voters — batch (parallel)">
        <p>
          For <code className="rounded bg-gray-100 px-1">tag: regular</code> pages that already have{' '}
          <code className="rounded bg-gray-100 px-1">ocr_data</code>, find each OCR voter row by CNIC
          and upsert matching voters in the voters collection (creates if missing, enriches if
          existing) with full reproduction and page-cutting data.
        </p>
        <CommandTable
          rows={[
            ['npm run enrich-voters -- --halka LA39 --parallel 20', 'Enrich all pending pages'],
            ['npm run enrich-voters -- --halka LA39 --block-codes 1180001,1180002', 'Limit block codes'],
            ['npm run enrich-voters -- --halka LA39 --force', 'Re-enrich pages already marked voterEnrichAt'],
            ['npm run enrich-voters -- --halka LA39 --release-claims', 'Clear stuck in-flight claims'],
          ]}
        />
        <CodeBlock>{`npm run enrich-voters -- --halka LA39 --parallel 20
npm run enrich-voters -- --halka LA39 --force`}</CodeBlock>
        <p className="mt-4 font-medium text-gray-900">Stop and resume</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Ctrl+C</strong> — workers finish the current page, then exit gracefully
          </li>
          <li>Re-run the same command to resume — pages without <code className="rounded bg-gray-100 px-1">voterEnrichAt</code> are picked up</li>
          <li>Stale claims older than 15 minutes are auto-released on startup</li>
          <li>
            Use <code className="rounded bg-gray-100 px-1">--release-claims</code> after a crash to unlock pages manually
          </li>
        </ul>
      </Section>

      <Section title="Process voters — batch (via API)">
        <p>
          Claim and process voter-list pages through <code className="rounded bg-gray-100 px-1">/api/process-page</code>:
          OCR → save ocr_data → insert new voters → mark page completed. Title pages are skipped.
        </p>
        <CommandTable
          rows={[
            ['npm run process-voters:local -- --halka LA39', 'Local dev server (localhost:3000)'],
            ['npm run process-voters -- --halka LA39', 'Deployed server URL'],
            ['npm run process-voters:local -- --halka LA39 --parallel 5', 'Parallel workers'],
            ['npm run process-voters:local -- --block-codes 1160010,1160011', 'Filter block codes'],
            ['npm run process-voters:local -- --include-completed', 'Re-process completed pages'],
          ]}
        />
        <CodeBlock>{`# Terminal 1
npm run dev

# Terminal 2
npm run process-voters:local -- --halka LA39 --parallel 5`}</CodeBlock>
      </Section>

      <Section title="Export voters — CSV / XLSX">
        <p>
          Export voters for a halka to CSV or XLSX. Runs in resumable batches with a progress bar and
          halka-based file names. For <code className="rounded bg-gray-100 px-1">xlsx</code>, all
          detected table columns are included automatically (unless{' '}
          <code className="rounded bg-gray-100 px-1">--fields</code> is set); use{' '}
          <code className="rounded bg-gray-100 px-1">--all-columns</code> to force this for CSV too.
        </p>
        <CommandTable
          rows={[
            ['npm run export-voters -- --halka LA41 --all-blockcodes --format xlsx --out ./exports', 'Export all block codes to XLSX with detected columns'],
            ['npm run export-voters -- --halka LA41 --block-codes 1854001,1854002 --format csv', 'Export specific block codes to CSV'],
            ['npm run export-voters -- --halka LA41 --all-blockcodes --all-columns --format csv', 'Force detected table columns in CSV'],
            ['npm run export-voters -- --halka LA41 --fields name,cnic,phone --format csv', 'Custom field selection'],
            ['npm run export-voters -- --list', 'List recent export jobs'],
            ['npm run export-voters -- --resume <jobId>', 'Resume an interrupted export'],
          ]}
        />
        <CodeBlock>{`npm run export-voters -- --halka LA41 --all-blockcodes --format xlsx --out ./exports`}</CodeBlock>
        <p className="mt-2 text-gray-500">
          Detected columns come from the constituency&apos;s Table columns settings (
          <HelpLink href="/dashboard/constituency">Constituency</HelpLink> → ⋮ → Table columns).
          Configure them first, otherwise column-based export reports an error.
        </p>
      </Section>

      <Section title="Enrich CNIC list with phones (Excel/CSV)">
        <p>
          Enrich a spreadsheet of CNICs by looking up phone numbers (phone-data) and joining voter
          details from MongoDB. This is designed for <strong>very large</strong> datasets and will
          split output into multiple Excel files with <strong>10,000 rows per file</strong>.
        </p>
        <CommandTable
          rows={[
            ['npm run enrich-phone-excel -- --in ./input.xlsx --out ./out', 'Enrich input XLSX → output parts in ./out (10k rows per file)'],
            ['npm run enrich-phone-excel -- --in ./input.csv --out ./out', 'CSV input is supported (recommended for huge files)'],
            ['npm run enrich-phone-excel -- --in ./input.xlsx --out ./out --no-voter', 'Only phone lookup (skip Mongo voter join)'],
          ]}
        />
        <p className="mt-2 text-gray-500">
          Input must include a CNIC column (headers like <code className="rounded bg-gray-100 px-1">CNIC</code>,{' '}
          <code className="rounded bg-gray-100 px-1">cnic</code>, <code className="rounded bg-gray-100 px-1">idcard</code>). Output files are named{' '}
          <code className="rounded bg-gray-100 px-1">phone-enriched-part-0001.xlsx</code>,{' '}
          <code className="rounded bg-gray-100 px-1">phone-enriched-part-0002.xlsx</code>, etc.
        </p>
      </Section>

      <Section title="Verify data integrity">
        <p>
          Cross-check local upload folders against MongoDB. For each block code it compares local
          image files, <code className="rounded bg-gray-100 px-1">blockcodes</code> pages,{' '}
          <code className="rounded bg-gray-100 px-1">voters</code> count, and OCR-processed pages.
          Rows print one at a time as they are checked, and results can be exported to CSV.
        </p>
        <CommandTable
          rows={[
            ['npm run verify-data', 'Interactive — prompts for halka, folder, and CSV export'],
            ['npm run verify-data -- --halka LA41 --folder /path/to/LA41', 'Non-interactive check'],
            ['npm run verify-data -- --halka LA41 --folder /path/to/LA41 --export ./integrity-report.csv', 'Write full report to CSV'],
          ]}
        />
        <CodeBlock>{`npm run verify-data -- --halka LA41 --folder /Users/you/Downloads/LA41 --export ./integrity-report.csv`}</CodeBlock>
        <p className="mt-2 text-gray-500">
          Point <code className="rounded bg-gray-100 px-1">--folder</code> at the constituency root
          that contains block-code subfolders (same layout as the{' '}
          <HelpLink href="/dashboard/help/vdp-uploader">VDP Image Uploader</HelpLink>). A{' '}
          <code className="rounded bg-gray-100 px-1">no</code> under Upload OK means the local file
          count and DB page count differ.
        </p>
      </Section>

      <Section title="Mark title pages — batch (via API)">
        <p>
          Detect and tag title pages (<code className="rounded bg-gray-100 px-1">tag=title</code>) so
          they are excluded from voter processing.
        </p>
        <CommandTable
          rows={[
            ['npm run mark-title-pages:local -- --halka LA39', 'Tag title pages via local dev server'],
            ['npm run mark-title-pages -- --halka LA39', 'Tag via deployed server'],
            ['npm run mark-title-pages:local -- --halka LA39 --parallel 5', 'Parallel workers'],
            ['npm run mark-title-pages:local -- --block-code 1160010', 'Single block code'],
            ['npm run mark-title-pages:local -- --retag', 'Re-tag already tagged pages'],
          ]}
        />
        <CodeBlock>{`npm run dev
npm run mark-title-pages:local -- --halka LA39 --parallel 5`}</CodeBlock>
      </Section>

      <Section title="Utilities">
        <CommandTable
          rows={[
            ['npm run dev', 'Start Next.js dev server'],
            ['npm run build', 'Production build'],
            ['npm run start', 'Start production server'],
            ['npm run test-google-vision', 'Verify Google Vision credentials'],
            ['npm run export-voters -- --list', 'List recent export jobs'],
            ['npm run verify-data', 'Interactive data integrity check'],
          ]}
        />
      </Section>

      <Section title="Environment variables">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead>
              <tr>
                <th className="py-2 pr-4 text-left font-semibold text-gray-900">Variable</th>
                <th className="py-2 text-left font-semibold text-gray-900">Used by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[
                ['NEXT_PUBLIC_MONGODB_URI', 'All database scripts'],
                ['GOOGLE_VISION_API_KEY', 'OCR scripts (preferred)'],
                ['GOOGLE_VISION_CLIENT_EMAIL / PRIVATE_KEY / PROJECT_ID', 'OCR (service account)'],
                ['HALKA_NAME', 'Optional default for --halka'],
                ['PARALLEL', 'Optional default worker count'],
                ['BLOCK_CODE / BLOCK_CODES', 'Optional default block filters'],
                ['FORCE', 'Set true to force re-OCR or re-enrich'],
                ['BASE_URL', 'API scripts — default http://localhost:3000'],
              ].map(([name, used]) => (
                <tr key={name}>
                  <td className="py-2 pr-4 font-mono text-xs text-indigo-700">{name}</td>
                  <td className="py-2 text-gray-600">{used}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="UI alternatives">
        <p>Many operations are also available in the dashboard without CLI:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <HelpLink href="/dashboard/constituency">Constituency</HelpLink> — view uploads, run OCR
            from page menu, open OCR reproduction view
          </li>
          <li>
            <HelpLink href="/dashboard/constituency">Constituency</HelpLink> — open a page&apos;s OCR
            reproduction view from the uploads table
          </li>
          <li>
            <HelpLink href="/dashboard/search-voters">Search Voters</HelpLink> — search by CNIC,
            reproduced row text, and Cloudinary row scan
          </li>
          <li>
            <HelpLink href="/dashboard/processing">Data Processing</HelpLink> — manual voter entry,
            polling scheme import
          </li>
        </ul>
      </Section>

      <Section title="Related guides">
        <ul className="list-disc space-y-1 pl-5">
          <li><HelpLink href="/dashboard/help/vdp-uploader">VDP Image Uploader</HelpLink></li>
          <li><HelpLink href="/dashboard/help/constituency">Constituency</HelpLink></li>
          <li><HelpLink href="/dashboard/help/search-voters">Search Voters</HelpLink></li>
          <li><HelpLink href="/dashboard/help/data-processing">Data Processing</HelpLink></li>
        </ul>
      </Section>
    </div>
  );
}
