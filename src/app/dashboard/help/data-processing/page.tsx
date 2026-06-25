'use client';

import { HelpLink, HelpPageHeader, Section } from '@/components/help/HelpDoc';

export default function DataProcessingHelpPage() {
  return (
    <div className="space-y-8">
      <HelpPageHeader
        title="Data Processing"
        description="Create and manage constituencies, add voters manually, import polling schemes, and view data reports."
      />

      <Section title="Overview">
        <p>
          Data Processing is an admin-only section for setting up constituencies, importing polling
          scheme spreadsheets, manually adding voter records, and monitoring data quality.
        </p>
        <p>
          Open from the main menu: <HelpLink href="/dashboard/processing">Data Processing</HelpLink>
          (visible to authorized admin accounts).
        </p>
      </Section>

      <Section title="Create New Constituency">
        <p>Register a new Halka before uploading or processing voter list images:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Name</strong> — Halka identifier (normalized to uppercase, no spaces)</li>
          <li><strong>Label</strong> — display label</li>
          <li><strong>Description</strong> — optional notes</li>
          <li><strong>Block Codes</strong> — one block code per line</li>
        </ul>
        <p className="mt-2">
          You can create a constituency with the same name as a previously <em>deleted</em> one. Only
          one active constituency per name is allowed at a time.
        </p>
      </Section>

      <Section title="Manage constituencies">
        <p>The constituencies list shows all <strong>active</strong> records. For each entry you can:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Edit</strong> — update name, label, description, or block codes</li>
          <li><strong>Delete</strong> — soft-delete (recoverable via Tools → Recover Constituencies)</li>
        </ul>
        <p className="mt-2">
          For viewing stats, uploads, and estimates use the{' '}
          <HelpLink href="/dashboard/help/constituency">Constituency</HelpLink> page instead.
        </p>
      </Section>

      <Section title="Add Voter (manual entry)">
        <p>Manually insert a single voter record without OCR:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>CNIC</strong> — formatted as #####-#######-#</li>
          <li><strong>Halka Name</strong>, <strong>Block Code</strong></li>
          <li><strong>Silsila No</strong>, <strong>Gharana No</strong></li>
          <li><strong>Name</strong></li>
        </ul>
        <p className="mt-2">
          The form supports <strong>English</strong> and <strong>Urdu</strong> validation messages.
          Switch language with the toggle above the form.
        </p>
      </Section>

      <Section title="Import Polling Scheme">
        <p>Upload an Excel or CSV file to load polling station metadata:</p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>Enter the <strong>Halka Name</strong> (e.g. PP23)</li>
          <li>Select a <code className="rounded bg-gray-100 px-1">.xls</code>, <code className="rounded bg-gray-100 px-1">.xlsx</code>, or <code className="rounded bg-gray-100 px-1">.csv</code> file</li>
          <li>Click <strong>Upload Polling Scheme</strong></li>
        </ol>
        <p className="mt-2 font-medium">Required columns:</p>
        <p className="font-mono text-xs text-gray-600">
          sn, polling_station_name, area, blockcode, male, female
        </p>
        <p className="mt-2 font-medium">Optional columns:</p>
        <p className="font-mono text-xs text-gray-600">
          total, male_booth, female_booth, total_booth
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Rows with empty <code className="rounded bg-gray-100 px-1">blockcode</code> are skipped</li>
          <li><code className="rounded bg-gray-100 px-1">total</code> is calculated as male + female if omitted</li>
          <li>Imported data appears in <HelpLink href="/dashboard/help/search-voters">Search Voters</HelpLink> polling info</li>
        </ul>
      </Section>

      <Section title="Polling scheme tools">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Reset In Queue</strong> — resets block code upload records stuck in processing
            status so they can be processed again
          </li>
          <li>
            <strong>Delete Records</strong> — remove polling scheme rows by serial number, block code,
            or Halka name
          </li>
        </ul>
      </Section>

      <Section title="Data Report">
        <p>
          The Data Report section shows field-level statistics for processed voter records (totals per
          field). Click <strong>Refresh Report</strong> to reload the latest counts from the database.
        </p>
      </Section>

      <Section title="Typical workflow">
        <ol className="list-decimal space-y-2 pl-5">
          <li>Create a constituency with its block codes (this page)</li>
          <li>Upload voter list images with the <HelpLink href="/dashboard/help/vdp-uploader">VDP Image Uploader</HelpLink></li>
          <li>Review uploads and process voters on the <HelpLink href="/dashboard/help/constituency">Constituency</HelpLink> page</li>
          <li>Import polling scheme data (this page)</li>
          <li>Search and verify voters in <HelpLink href="/dashboard/help/search-voters">Search Voters</HelpLink></li>
        </ol>
      </Section>
    </div>
  );
}
