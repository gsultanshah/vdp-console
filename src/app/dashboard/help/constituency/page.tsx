'use client';

import { HelpLink, HelpPageHeader, Section } from '@/components/help/HelpDoc';

export default function ConstituencyHelpPage() {
  return (
    <div className="space-y-8">
      <HelpPageHeader
        title="Constituency"
        description="Open a Halka home page, manage block codes, generate voter parchi, fix polling stations, and (as admin) rename block codes."
      />

      <Section title="Overview">
        <p>
          The Constituency page lists all active and inactive constituencies (Halkas). Open a Halka to
          reach its <strong>constituency home</strong> — overview stats, tools, polling scheme, voter
          parchi generation, and the full block codes table.
        </p>
        <p>
          Open this page from the main menu:{' '}
          <HelpLink href="/dashboard/constituency">Constituency</HelpLink>
        </p>
      </Section>

      <Section title="Constituency cards (list)">
        <p>Each card displays:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Halka name</strong> and last updated date
          </li>
          <li>Real voter counts (male / female / total) or estimated religion/gender counts</li>
          <li>
            <strong>Inactive</strong> badge when the constituency is disabled
          </li>
        </ul>
        <p className="mt-2">Quick actions on each card (active constituencies only):</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Browse voters</strong> / <strong>Voters list</strong> — open voter tools for the Halka
          </li>
          <li>
            <strong>Browse pages</strong> / <strong>Upload URLs</strong> — review uploaded list images
          </li>
          <li>
            <strong>Open constituency home</strong> — full tools and block codes table
          </li>
        </ul>
      </Section>

      <Section title="Constituency home">
        <p>
          After opening a Halka you get overview cards, gender/page charts, work progress, and a tools
          grid. Important tools:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Parchi designer</strong> — open the visual slip layout editor for this Halka
          </li>
          <li>
            <strong>Voter parchi</strong> — scroll to the bulk generation panel on the same page
          </li>
          <li>
            <strong>Voters / uploads / pages</strong> — browse and process data for the whole constituency
          </li>
        </ul>
        <p className="mt-2">
          Use the block code search box above the table to jump to a specific code. Matching rows are
          highlighted and scrolled into view.
        </p>
      </Section>

      <Section title="Block codes table">
        <p>The table lists every block code in the Halka with:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Real voter count (total / male / female)</li>
          <li>Estimated files and voter ranges</li>
          <li>
            <strong>Work status</strong> — click to set pending / processing / completed (and comments)
          </li>
          <li>
            Action icons: hub, uploads, browse voters, AI fix, browse pages, quick upload, voter parchi
          </li>
        </ul>

        <p className="mt-3 font-medium text-gray-900">Quick filters</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Filter: with parchi</strong> — only blocks that already have a generated voter
            parchi PDF
          </li>
          <li>
            <strong>Filter: missing polling</strong> — only blocks with no polling station available
            for parchi generation
          </li>
        </ul>
        <p className="mt-2">
          You can combine a text search with these filters. Counts above the table update to match what
          is currently shown.
        </p>
      </Section>

      <Section title="Voter parchi icon (colors)">
        <p>Each row has a document (voter parchi) icon. Color meaning:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Red</strong> — no polling station found for this block (scheme + saved overrides).
            Click to open the Voter Parchi modal and add/update the station, then generate.
          </li>
          <li>
            <strong>Green filled circle</strong> — a latest voter parchi PDF is ready for this block
            (download or regenerate)
          </li>
          <li>
            <strong>Light fuchsia</strong> — polling station is OK, but no PDF has been generated yet
          </li>
        </ul>
        <p className="mt-2">
          Use <strong>Bulk voter parchi</strong> above the table to generate many blocks in one run (with
          optional skip for blocks that already have a PDF).
        </p>
      </Section>

      <Section title="Voter Parchi modal">
        <p>
          Clicking the voter parchi icon opens a two-column modal for that block:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Left — Polling station</strong> — shows the current station (from polling scheme or a
            saved override). Use <strong>Edit</strong> / <strong>Add</strong> to change it and{' '}
            <strong>Save</strong>. Saved values are stored as a block-level override and reused later.
          </li>
          <li>
            <strong>Right — Download &amp; generate</strong> — download the latest PDF if available;
            choose design and gender; generate or regenerate the PDF.
          </li>
        </ul>
        <p className="mt-2">
          When you click <strong>Generate</strong>, the modal uses the polling station text currently
          shown (including unsaved edits): it saves that value first, then generates so the PDF always
          reflects the updated/new station.
        </p>
      </Section>

      <Section title="Admin block actions (admin only)">
        <p>
          Admins see a <strong>⋮</strong> (three-dot) icon in the Actions column. Open it for:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <strong>Change name</strong> — rename a block code (for example{' '}
            <code className="rounded bg-gray-100 px-1">1234567</code> →{' '}
            <code className="rounded bg-gray-100 px-1">001238834</code>). You must type{' '}
            <code className="rounded bg-gray-100 px-1">RENAME</code> to confirm. The new code must not
            already exist in the same constituency.
          </li>
          <li>
            <strong>Delete</strong> — soft-delete removes the code from the active constituency list so
            it no longer appears in the block table, exports, bulk/all-block parchi selection, or mobile
            block lists. Voters and uploaded pages stay in the database. Restore from{' '}
            <HelpLink href="/dashboard/tools">Tools → Recover Block Codes</HelpLink>.
          </li>
        </ul>
        <p className="mt-2">Rename updates, with live step progress:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Constituency block list</li>
          <li>All voters for that block</li>
          <li>Uploaded pages</li>
          <li>Work progress records</li>
          <li>Polling scheme rows</li>
          <li>Polling station overrides</li>
          <li>Latest voter parchi files</li>
          <li>Mobile access codes that list this block</li>
          <li>Voter parchi jobs and export jobs</li>
        </ul>
        <p className="mt-2">
          Avoid processing the same block while rename is running. Soft-deleted codes are not re-added by
          PDF upload until restored.
        </p>
      </Section>

      <Section title="Other row actions">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Work Status badge</strong> — click the badge in the Work Status column to open the
            work progress tracker
          </li>
          <li>
            <strong>Block hub</strong> — open the dedicated block code hub page
          </li>
          <li>
            <strong>Uploads / browse pages</strong> — list or flip through page images
          </li>
          <li>
            <strong>Browse voters</strong> — voter browser filtered to this block
          </li>
          <li>
            <strong>AI Fix</strong> — batch fix silsila &amp; age
          </li>
          <li>
            <strong>Quick upload</strong> — upload a single page image for the block
          </li>
          <li>
            <strong>Estimate / Process Voter</strong> — available to process-authorized emails; OCR and
            enrich voters for the block
          </li>
        </ul>
      </Section>

      <Section title="Upload URLs table">
        <p>From the upload URLs action you can:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Browse uploads in pages of 25, 50, or 100 rows</li>
          <li>Copy image URL to clipboard</li>
          <li>Open image in a new browser tab</li>
          <li>Open the in-app image viewer for any row</li>
        </ul>
        <p>Full URLs are not shown in the table — use the action buttons instead.</p>
      </Section>

      <Section title="Card menu (⋮)">
        <p>Authorized users see a three-dot menu on each list card:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Set Inactive</strong> — disables search and all functionality; requires confirmation
          </li>
          <li>
            <strong>Set Active</strong> — re-enables an inactive constituency
          </li>
          <li>
            <strong>Delete</strong> — soft-deletes the constituency (removed from this list)
          </li>
        </ul>
        <p className="mt-2">
          Deleted constituencies can be restored from{' '}
          <HelpLink href="/dashboard/tools">Tools → Recover Constituencies</HelpLink>.
        </p>
      </Section>

      <Section title="Inactive constituencies">
        <ul className="list-disc space-y-1 pl-5">
          <li>Shown with an Inactive badge; all actions are disabled</li>
          <li>
            Voters from inactive Halkas are excluded from{' '}
            <HelpLink href="/dashboard/search-voters">Search Voters</HelpLink>
          </li>
          <li>Upload and block code APIs are blocked for inactive Halkas</li>
        </ul>
      </Section>

      <Section title="Name conflicts (delete & restore)">
        <ul className="list-disc space-y-1 pl-5">
          <li>After a constituency is deleted, you can create a new one with the same Halka name</li>
          <li>
            On restore, if the name is already taken, the restored record is renamed with a suffix:{' '}
            <code className="rounded bg-gray-100 px-1">NA-01-1</code>,{' '}
            <code className="rounded bg-gray-100 px-1">NA-01-2</code>, etc.
          </li>
          <li>There is no limit on delete/restore cycles</li>
        </ul>
      </Section>

      <Section title="Related">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <HelpLink href="/dashboard/help/voter-parchi-designer">Voter Parchi Designer</HelpLink> —
            visual slip layout, design codes, and PDF preview
          </li>
          <li>
            <HelpLink href="/dashboard/help/cli-commands">CLI Commands</HelpLink> —{' '}
            <code className="rounded bg-gray-100 px-1">export-parchi</code> with design codes and
            interactive polling station prompts
          </li>
          <li>
            <HelpLink href="/dashboard/help/vdp-uploader">VDP Image Uploader</HelpLink> — upload images
            before processing
          </li>
          <li>
            <HelpLink href="/dashboard/help/data-processing">Data Processing</HelpLink> — create
            constituencies and import polling schemes
          </li>
        </ul>
      </Section>
    </div>
  );
}
