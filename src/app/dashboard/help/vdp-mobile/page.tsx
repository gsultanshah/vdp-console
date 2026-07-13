'use client';

import { HelpLink, HelpPageHeader, Section } from '@/components/help/HelpDoc';

export default function VdpMobileHelpPage() {
  return (
    <div className="space-y-8">
      <HelpPageHeader
        title="VDP Mobile"
        description="Complete guide to the VDP field app — login, voter search, offline blocks, parchi sharing, and admin setup."
      />

      <Section title="What is VDP Mobile?">
        <p>
          <strong>VDP Mobile</strong> is the Flutter field app used by campaign teams to search voters,
          view parchi (voter slips), share voter information, and work without internet after downloading
          block data. Each field user signs in with a <strong>6-digit access code</strong> created in
          the web console. The code is linked to one constituency (Halka), so users only see voters for
          that area.
        </p>
        <p>
          The app connects to the same VDP server as this console. Online search uses live data;
          offline mode searches voters saved on the device from downloaded blocks.
        </p>
      </Section>

      <Section title="Admin setup (web console)">
        <p>
          Before field workers can use the app, an administrator must create mobile logins under{' '}
          <HelpLink href="/dashboard/users">Users</HelpLink> → <strong>Mobile logins</strong>.
        </p>

        <p className="font-medium text-gray-900">Create one login manually</p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>Select the <strong>constituency</strong> (Halka) for this field team</li>
          <li>
            Enter the worker&apos;s <strong>name</strong>, <strong>phone</strong>,{' '}
            <strong>address</strong>, and optional <strong>comments</strong>
          </li>
          <li>Optionally choose a branding template and custom app title</li>
          <li>
            Click <strong>Generate 6-digit login code</strong> and share the code with the field worker
          </li>
        </ol>

        <p className="font-medium text-gray-900">Bulk import from Excel</p>
        <p>
          On the same page, use <strong>Bulk import from Excel</strong> to create many codes at once.
          Upload <code className="rounded bg-gray-100 px-1">.xls</code>,{' '}
          <code className="rounded bg-gray-100 px-1">.xlsx</code>, or{' '}
          <code className="rounded bg-gray-100 px-1">.csv</code> with columns:{' '}
          <code className="rounded bg-gray-100 px-1">name</code> (required),{' '}
          <code className="rounded bg-gray-100 px-1">phone</code>,{' '}
          <code className="rounded bg-gray-100 px-1">address</code>,{' '}
          <code className="rounded bg-gray-100 px-1">comments</code>,{' '}
          <code className="rounded bg-gray-100 px-1">constituency</code> (optional),{' '}
          <code className="rounded bg-gray-100 px-1">label</code> (optional). Download the sample file
          from the import card for the correct format.
        </p>

        <p className="font-medium text-gray-900">Branding</p>
        <p>
          Each code can use a branding template (colors, logo, app title) so the mobile app matches your
          campaign identity. Templates are managed via the mobile admin API and appear in the create form
          when configured.
        </p>

        <p className="font-medium text-gray-900">Disable a code</p>
        <p>
          Use the <strong>Active / Disabled</strong> switch on any row to revoke access without deleting
          the record. Disabled codes cannot sign in.
        </p>
      </Section>

      <Section title="Signing in (field app)">
        <ol className="list-decimal space-y-2 pl-5">
          <li>Install and open <strong>VDP Mobile</strong> on the device</li>
          <li>Enter the <strong>6-digit access code</strong> provided by your admin</li>
          <li>Tap <strong>Continue</strong></li>
        </ol>
        <p>
          If the code is wrong, the app shows an error and a <strong>Retry</strong> button that clears
          the PIN so you can try again. There is no server URL setting on the login screen — the app uses
          the production VDP API automatically.
        </p>
        <p className="text-gray-500">
          An <strong>Admin sign in</strong> link exists for console administrators testing the app with
          email/password. Normal field workers should only use the 6-digit code.
        </p>
      </Section>

      <Section title="Home screen layout">
        <p>After login, the home screen has three tabs at the bottom:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Search</strong> (magnifying glass) — find voters by CNIC or name
          </li>
          <li>
            <strong>Download</strong> (download icon) — download block voter data for offline use
          </li>
          <li>
            <strong>More</strong> — session info, downloaded blocks, online/offline mode, sign out
          </li>
        </ul>
        <p>
          The header shows the <strong>constituency name</strong> (top left) and a <strong>sign out</strong>{' '}
          icon (top right). On the Search tab, an <strong>Online / Offline</strong> toggle appears in the
          header when you need to switch work mode.
        </p>
      </Section>

      <Section title="Online vs offline mode">
        <p className="font-medium text-gray-900">Online mode (default)</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Requires internet and a valid access-code session</li>
          <li>Searches the live voter database on the server for your constituency</li>
          <li>Best when connectivity is good and you need the latest data</li>
        </ul>

        <p className="mt-4 font-medium text-gray-900">Offline mode</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Works without internet after you have downloaded at least one block</li>
          <li>Searches <strong>all downloaded blocks</strong> on the device</li>
          <li>
            Results from the <strong>selected block</strong> are sorted first; other downloaded blocks are
            included too
          </li>
          <li>Select which block is preferred from the block picker on the Search tab or in the More tab</li>
        </ul>

        <p className="mt-2 text-gray-500">
          The status badge shows <strong>Online</strong>, <strong>Online · no network</strong>, or{' '}
          <strong>Offline · [block code]</strong> so field workers know their current mode.
        </p>
      </Section>

      <Section title="Searching voters">
        <ol className="list-decimal space-y-2 pl-5">
          <li>Open the <strong>Search</strong> tab (opens automatically after login)</li>
          <li>
            Type a <strong>CNIC</strong> (digits) or <strong>name</strong> in the large search field
          </li>
          <li>
            Tap <strong>Search</strong> or submit from the keyboard (numeric keyboard for CNIC-style
            input)
          </li>
          <li>Results appear as cards below the search field</li>
        </ol>

        <p className="font-medium text-gray-900">Search tips</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Tap outside the search field or on a result to dismiss the keyboard</li>
          <li>Use the <strong>X</strong> on the search field to clear the query and results</li>
          <li>CNIC searches normalize digits; partial CNIC (5+ digits) is supported online</li>
          <li>In offline mode, download blocks first if you see “No voters saved offline”</li>
        </ul>

        <p className="font-medium text-gray-900">Result cards</p>
        <p>Each result shows voter name, CNIC, and a cropped row image from the voter list when available. At the bottom of each card:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Open parchi</strong> — full-screen parchi PDF viewer with download and print
          </li>
          <li>
            <strong>Share info</strong> — share a WhatsApp-friendly image with voter details and row crop
          </li>
        </ul>
        <p>
          Tapping the card body opens a <strong>detail sheet</strong> with full address, polling station,
          block/silsila, and the same parchi and share actions.
        </p>
      </Section>

      <Section title="Parchi (voter slip)">
        <p>
          <strong>Parchi</strong> is the printable voter slip PDF generated from voter data and your
          campaign branding. From a search result:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Open parchi</strong> opens a preview with pinch/zoom on the row crop image
          </li>
          <li>
            <strong>Download PDF</strong> saves the parchi file on the device
          </li>
          <li>
            <strong>Print</strong> sends the PDF to the system print dialog
          </li>
        </ul>
        <p>
          Parchi layout uses branding linked to the access code (logo, colors, constituency title).
        </p>
      </Section>

      <Section title="Sharing voter information">
        <p>
          <strong>Share info</strong> creates an image suitable for WhatsApp or other apps, including
          voter name, CNIC, and the list row crop when available. On iOS, sharing uses the share sheet
          anchored to the button you tapped (required for iPad compatibility).
        </p>
        <p className="text-gray-500">
          Sharing requires the target app (e.g. WhatsApp) to be installed on the device.
        </p>
      </Section>

      <Section title="Downloading blocks (offline data)">
        <p>
          Block codes match the constituency&apos;s voter list segments (same block codes as in{' '}
          <HelpLink href="/dashboard/help/constituency">Constituency</HelpLink> and processing). To
          download:
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>Open the <strong>Download</strong> tab</li>
          <li>Requires internet — the app loads available blocks for your constituency</li>
          <li>Search or pick a <strong>block code</strong> from the list</li>
          <li>Tap <strong>Download block</strong> to save voters to the device</li>
        </ol>

        <p className="font-medium text-gray-900">During download</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Large blocks download in chunks with progress (chunks and voter counts shown)</li>
          <li>
            <strong>Pause</strong> stops after the current chunk; <strong>Resume</strong> continues
          </li>
          <li>
            <strong>Cancel</strong> aborts and removes the in-progress download
          </li>
          <li>Completed blocks work fully offline for search</li>
        </ul>

        <p className="font-medium text-gray-900">After download</p>
        <p>
          View downloaded blocks under the <strong>More</strong> tab. Switch to offline mode on the Search
          tab to search without internet.
        </p>
      </Section>

      <Section title="More tab">
        <p>The More tab shows:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Constituency</strong> and access label for the current session
          </li>
          <li>
            <strong>Connection</strong> — whether the device has network
          </li>
          <li>
            <strong>Mode</strong> — online search or offline with selected block
          </li>
          <li>
            <strong>Downloaded blocks</strong> — list with voter counts; pull to refresh
          </li>
          <li>
            <strong>Sign out</strong> — ends the session (confirmation dialog)
          </li>
        </ul>
      </Section>

      <Section title="Usage logging &amp; audit (admin)">
        <p>
          VDP Mobile records field activity for accountability. Events are sent to the server when online,
          or queued on the device and synced when connectivity returns.
        </p>

        <p className="font-medium text-gray-900">What is logged</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Login, logout, and session restore</li>
          <li>Every search (query, online/offline mode, result count, blocks searched)</li>
          <li>Viewing a voter, opening parchi, downloading or printing parchi</li>
          <li>Sharing voter info</li>
          <li>Block download start, pause, cancel, complete, and failures</li>
          <li>Switching online/offline mode and selecting a block</li>
          <li>Tab navigation (search, download, more)</li>
        </ul>

        <p className="font-medium text-gray-900">Location</p>
        <p>
          When the user allows location permission, searches and actions include GPS coordinates (latitude,
          longitude, accuracy). This helps administrators see where field work happened. If permission is
          denied, events are still logged with time and metadata but without location.
        </p>

        <p className="font-medium text-gray-900">Viewing logs in the console</p>
        <p>
          Go to <HelpLink href="/dashboard/users">Users</HelpLink> → <strong>Mobile usage</strong>. Filter
          by constituency, access code, event type, and time window. Click a row to expand full JSON
          metadata, device info, and request details. Location links open in Google Maps.
        </p>
      </Section>

      <Section title="Permissions (device)">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Internet</strong> — online search, downloads, usage sync, login
          </li>
          <li>
            <strong>Location (when in use)</strong> — optional; used for usage audit logs
          </li>
          <li>
            <strong>Storage</strong> — offline voter database and downloaded parchi files
          </li>
        </ul>
        <p className="mt-2 text-gray-500">
          On first use, iOS and Android may prompt for location when logging activity. Field workers
          should allow this if your organization requires location audit trails.
        </p>
      </Section>

      <Section title="Troubleshooting">
        <p className="font-medium text-gray-900">“No online matches” / empty search</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Check internet connection and that you are in Online mode</li>
          <li>Verify the voter exists in this constituency on the server</li>
          <li>Try CNIC digits only, or a shorter name fragment</li>
          <li>Ensure the access code is still Active in Users → Mobile logins</li>
        </ul>

        <p className="mt-4 font-medium text-gray-900">“No matches in downloaded blocks”</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Confirm the correct block was downloaded (More tab)</li>
          <li>Download additional blocks if the voter may be in another block</li>
          <li>Re-download if data was updated on the server</li>
        </ul>

        <p className="mt-4 font-medium text-gray-900">Share not working (iOS)</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Share must be triggered from the button on the result card (not a random screen area)</li>
          <li>Ensure WhatsApp or another share target is installed</li>
        </ul>

        <p className="mt-4 font-medium text-gray-900">Session expired</p>
        <p>Sign out and enter the 6-digit code again. Ask an admin to confirm the code is still Active.</p>

        <p className="mt-4 font-medium text-gray-900">Usage not appearing in console</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Events sync when the device regains internet — wait and refresh Mobile usage</li>
          <li>Ensure the backend with usage APIs is deployed (same server the app uses)</li>
          <li>Check filters (constituency, date range, access code)</li>
        </ul>
      </Section>

      <Section title="Workflow summary">
        <div className="overflow-x-auto">
          <table className="min-w-full border border-gray-200 text-left text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="border-b px-3 py-2">Role</th>
                <th className="border-b px-3 py-2">Steps</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border-b px-3 py-2 align-top font-medium">Admin</td>
                <td className="border-b px-3 py-2">
                  Users → Mobile logins → create code(s) → share 6-digit code → monitor Mobile usage
                </td>
              </tr>
              <tr>
                <td className="border-b px-3 py-2 align-top font-medium">Field worker</td>
                <td className="border-b px-3 py-2">
                  Enter code → Download blocks (once) → Search online or offline → Open parchi / Share
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Related">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <HelpLink href="/dashboard/users">Users</HelpLink> — mobile logins and usage log
          </li>
          <li>
            <HelpLink href="/dashboard/help/user-management">User Management</HelpLink> — web console
            accounts (separate from mobile codes)
          </li>
          <li>
            <HelpLink href="/dashboard/help/constituency">Constituency</HelpLink> — block codes and voter
            data source
          </li>
          <li>
            <HelpLink href="/dashboard/help/search-voters">Search Voters</HelpLink> — web search (same voter
            database as mobile online mode)
          </li>
        </ul>
      </Section>
    </div>
  );
}
