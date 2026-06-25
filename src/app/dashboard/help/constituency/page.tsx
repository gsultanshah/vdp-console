'use client';

import { CodeBlock, HelpLink, HelpPageHeader, Section } from '@/components/help/HelpDoc';

export default function ConstituencyHelpPage() {
  return (
    <div className="space-y-8">
      <HelpPageHeader
        title="Constituency"
        description="View constituency statistics, manage block codes, browse uploaded images, and control constituency status."
      />

      <Section title="Overview">
        <p>
          The Constituency page lists all active and inactive constituencies (Halkas). Each card shows
          voter counts by religion and gender, block code associations, and tools for reviewing uploaded
          voter list images.
        </p>
        <p>
          Open this page from the main menu: <HelpLink href="/dashboard/constituency">Constituency</HelpLink>
        </p>
      </Section>

      <Section title="Constituency cards">
        <p>Each card displays:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Halka name</strong> and last updated date</li>
          <li>Counts: Muslim Male/Female, Qadiani Male/Female, Total Voters</li>
          <li><strong>Inactive</strong> badge when the constituency is disabled</li>
        </ul>
        <p className="mt-2">Quick actions on each card (active constituencies only):</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Table icon</strong> — paginated list of all upload image URLs</li>
          <li><strong>Photo icon</strong> — image viewer with Previous/Next and arrow-key navigation</li>
          <li><strong>View Block Codes</strong> — expand block code statistics table</li>
        </ul>
      </Section>

      <Section title="Upload URLs table">
        <p>From the table icon you can:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Browse uploads in pages of 25, 50, or 100 rows</li>
          <li>Copy image URL to clipboard</li>
          <li>Open image in a new browser tab</li>
          <li>Open the in-app image viewer for any row</li>
        </ul>
        <p>Full URLs are not shown in the table — use the action buttons instead.</p>
      </Section>

      <Section title="Block codes">
        <p>After clicking <strong>View Block Codes</strong>, a table shows each block code with:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Total files and estimated voter counts</li>
          <li>Religion and gender estimate ranges</li>
          <li>Per-row upload URL and image viewer icons</li>
        </ul>
        <p className="mt-2">Admin users can also:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Estimate</strong> — calculate voter estimates for a block code</li>
          <li><strong>Estimate Constituency</strong> — run estimates across all block codes</li>
          <li><strong>Process Voter</strong> — OCR uploaded pages and save voters to the database</li>
        </ul>
      </Section>

      <Section title="Card menu (⋮)">
        <p>Admin users see a three-dot menu on each card:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Set Inactive</strong> — disables search and all functionality; requires confirmation</li>
          <li><strong>Set Active</strong> — re-enables an inactive constituency</li>
          <li><strong>Delete</strong> — soft-deletes the constituency (removed from this list)</li>
        </ul>
        <p className="mt-2">
          Deleted constituencies can be restored from{' '}
          <HelpLink href="/dashboard/tools">Tools → Recover Constituencies</HelpLink>.
        </p>
      </Section>

      <Section title="Inactive constituencies">
        <ul className="list-disc space-y-1 pl-5">
          <li>Shown with an Inactive badge; all actions are disabled</li>
          <li>Voters from inactive Halkas are excluded from <HelpLink href="/dashboard/search-voters">Search Voters</HelpLink></li>
          <li>Upload and block code APIs are blocked for inactive Halkas</li>
        </ul>
      </Section>

      <Section title="Name conflicts (delete & restore)">
        <ul className="list-disc space-y-1 pl-5">
          <li>After a constituency is deleted, you can create a new one with the same Halka name</li>
          <li>On restore, if the name is already taken, the restored record is renamed with a suffix: <code className="rounded bg-gray-100 px-1">NA-01-1</code>, <code className="rounded bg-gray-100 px-1">NA-01-2</code>, etc.</li>
          <li>There is no limit on delete/restore cycles</li>
        </ul>
      </Section>

      <Section title="Related">
        <ul className="list-disc space-y-1 pl-5">
          <li><HelpLink href="/dashboard/help/vdp-uploader">VDP Image Uploader</HelpLink> — upload images before processing</li>
          <li><HelpLink href="/dashboard/help/data-processing">Data Processing</HelpLink> — create constituencies and import polling schemes</li>
        </ul>
      </Section>
    </div>
  );
}
