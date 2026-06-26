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
          and update matching voters in the voters collection with full reproduction and page-cutting
          data. Does not create new voters.
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
