'use client';

import { HelpLink, HelpPageHeader, Section } from '@/components/help/HelpDoc';

export default function SearchVotersHelpPage() {
  return (
    <div className="space-y-8">
      <HelpPageHeader
        title="Search Voters"
        description="Look up voters by CNIC, view list images, polling station details, and family members."
      />

      <Section title="Overview">
        <p>
          Search Voters lets you find a processed voter record using their CNIC (national ID). Results
          include voter metadata, a cropped list image, and linked polling scheme information.
        </p>
        <p>
          Open from the main menu: <HelpLink href="/dashboard/search-voters">Search Voters</HelpLink>
        </p>
      </Section>

      <Section title="How to search">
        <ol className="list-decimal space-y-2 pl-5">
          <li>Enter the CNIC in the format <code className="rounded bg-gray-100 px-1">#####-#######-#</code> (e.g. <code className="rounded bg-gray-100 px-1">34104-2955553-6</code>)</li>
          <li>The input auto-formats digits as you type (max 13 digits)</li>
          <li>Click <strong>Search</strong></li>
        </ol>
        <p className="mt-2">
          Only the first matching voter is shown initially. Voters from{' '}
          <strong>inactive constituencies</strong> are excluded from results.
        </p>
      </Section>

      <Section title="Voter details">
        <p>When a voter is found, the results show:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>CNIC</strong></li>
          <li><strong>Halka</strong> — constituency name</li>
          <li><strong>Block Code</strong></li>
          <li><strong>Silsila No</strong> — serial number on the voter list</li>
          <li><strong>Name</strong> — voter name from the list</li>
          <li><strong>Gender</strong> — derived from the last CNIC digit (odd = Male, even = Female)</li>
          <li><strong>Father / relation</strong>, <strong>Profession</strong>, <strong>Age</strong>, <strong>Address</strong> when stored</li>
        </ul>
        <p className="mt-2 font-medium text-gray-900">Reproduced row &amp; row scan</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Reproduced row</strong> — OCR text laid out in row spacing (no background scan)</li>
          <li><strong>Row scan</strong> — Cloudinary-cropped image of the voter&apos;s list row</li>
          <li><strong>Full page</strong> — link to the original scanned page</li>
        </ul>
        <p className="mt-2 text-gray-500">
          Reproduction data is populated by OCR and enrich scripts — see{' '}
          <HelpLink href="/dashboard/help/cli-commands">CLI Commands</HelpLink>.
        </p>
      </Section>

      <Section title="Show Family">
        <p>
          Click <strong>Show Family</strong> to load all voters sharing the same{' '}
          <code className="rounded bg-gray-100 px-1">blockCode</code> and{' '}
          <code className="rounded bg-gray-100 px-1">gharanaNo</code>. The table expands to list every
          family member with their own CNIC and list image.
        </p>
      </Section>

      <Section title="Polling station information">
        <p>
          When a voter is found, polling scheme data is loaded automatically (if imported via{' '}
          <HelpLink href="/dashboard/help/data-processing">Data Processing</HelpLink>). This includes:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Polling station name and area</li>
          <li>Male/female voter counts for the block code</li>
          <li>Booth numbers (male, female, total) when available</li>
        </ul>
      </Section>

      <Section title="No results">
        <p>Possible reasons for no match:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>CNIC not yet processed from uploaded voter lists</li>
          <li>Typo in the CNIC — verify the full 13-digit number</li>
          <li>Voter belongs to an inactive constituency</li>
          <li>Voter record not yet added to the database</li>
        </ul>
      </Section>

      <Section title="Related">
        <ul className="list-disc space-y-1 pl-5">
          <li><HelpLink href="/dashboard/help/cli-commands">CLI Commands</HelpLink> — OCR, save voter, enrich batch scripts</li>
          <li><HelpLink href="/dashboard/help/constituency">Constituency</HelpLink> — process uploaded images into voter records</li>
          <li><HelpLink href="/dashboard/help/data-processing">Data Processing</HelpLink> — import polling schemes and add voters manually</li>
        </ul>
      </Section>
    </div>
  );
}
