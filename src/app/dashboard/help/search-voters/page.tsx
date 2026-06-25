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
          <li><strong>Gharana No</strong> — household/family number</li>
          <li><strong>Image</strong> — link to view the voter&apos;s row on the scanned list</li>
        </ul>
        <p className="mt-2">
          Images are mirrored to Cloudinary for reliable display. A cropped row view is also available
          using the voter&apos;s row position on the source image.
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
          <li><HelpLink href="/dashboard/help/constituency">Constituency</HelpLink> — process uploaded images into voter records</li>
          <li><HelpLink href="/dashboard/help/data-processing">Data Processing</HelpLink> — import polling schemes and add voters manually</li>
        </ul>
      </Section>
    </div>
  );
}
