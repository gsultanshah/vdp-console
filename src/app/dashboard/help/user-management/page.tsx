'use client';

import { HelpLink, HelpPageHeader, Section } from '@/components/help/HelpDoc';

export default function UserManagementHelpPage() {
  return (
    <div className="space-y-8">
      <HelpPageHeader
        title="User Management"
        description="Create users, assign constituency access, import from Excel, and manage admin accounts."
      />

      <Section title="Overview">
        <p>
          User Management is available to accounts with a role other than{' '}
          <code className="rounded bg-gray-100 px-1">user</code> (for example{' '}
          <code className="rounded bg-gray-100 px-1">admin</code>). Open it from the main menu:{' '}
          <HelpLink href="/dashboard/users">Users</HelpLink>
        </p>
        <p>
          Passwords are stored in plain text. Admin users cannot be deleted from the UI.
        </p>
      </Section>

      <Section title="Tabs">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>All Users</strong> — every account in the system
          </li>
          <li>
            <strong>Admin</strong> — admin accounts only (protected from deletion)
          </li>
        </ul>
      </Section>

      <Section title="Create a user manually">
        <ol className="list-decimal space-y-2 pl-5">
          <li>Click <strong>Add New User</strong></li>
          <li>Enter name, email, and password (all required)</li>
          <li>Choose role: <strong>user</strong> or <strong>admin</strong></li>
          <li>
            Choose <strong>Constituency access</strong>:
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <strong>All constituencies</strong> — access to every active constituency
              </li>
              <li>
                <strong>Specific constituency</strong> — restrict to one Halka name from the list
              </li>
            </ul>
          </li>
          <li>Click <strong>Create user</strong></li>
        </ol>
        <p className="mt-2 text-gray-500">
          Admin users always receive access to all constituencies.
        </p>
      </Section>

      <Section title="Import users from Excel">
        <p>
          Click <strong>Import from Excel</strong> on the Users page. Supported formats:{' '}
          <code className="rounded bg-gray-100 px-1">.xls</code>,{' '}
          <code className="rounded bg-gray-100 px-1">.xlsx</code>,{' '}
          <code className="rounded bg-gray-100 px-1">.csv</code>.
        </p>

        <p className="font-medium text-gray-900">Required columns</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><code className="rounded bg-gray-100 px-1">name</code></li>
          <li><code className="rounded bg-gray-100 px-1">email</code></li>
          <li><code className="rounded bg-gray-100 px-1">password</code></li>
        </ul>

        <p className="font-medium text-gray-900">Optional columns</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <code className="rounded bg-gray-100 px-1">role</code> —{' '}
            <code className="rounded bg-gray-100 px-1">user</code> (default) or{' '}
            <code className="rounded bg-gray-100 px-1">admin</code>
          </li>
          <li>
            <code className="rounded bg-gray-100 px-1">constituency</code> — Halka name (e.g.{' '}
            <code className="rounded bg-gray-100 px-1">NA120</code>) or{' '}
            <code className="rounded bg-gray-100 px-1">all</code>. Leave blank to use the default
            selected in the import dialog.
          </li>
        </ul>

        <p className="font-medium text-gray-900">Sample file</p>
        <p>Download a ready-made template and replace the example rows with your data:</p>
        <div className="flex flex-wrap gap-3">
          <a
            href="/api/users/import/sample"
            className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Download sample .xlsx
          </a>
          <a
            href="/samples/user-import-sample.csv"
            download
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Download sample .csv
          </a>
        </div>

        <p className="font-medium text-gray-900">Example rows</p>
        <div className="overflow-x-auto">
          <table className="min-w-full border border-gray-200 text-left text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="border-b px-3 py-2">name</th>
                <th className="border-b px-3 py-2">email</th>
                <th className="border-b px-3 py-2">password</th>
                <th className="border-b px-3 py-2">role</th>
                <th className="border-b px-3 py-2">constituency</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border-b px-3 py-2">Ali Khan</td>
                <td className="border-b px-3 py-2">ali@example.com</td>
                <td className="border-b px-3 py-2">pass123</td>
                <td className="border-b px-3 py-2">user</td>
                <td className="border-b px-3 py-2">NA120</td>
              </tr>
              <tr>
                <td className="border-b px-3 py-2">Sara Ahmed</td>
                <td className="border-b px-3 py-2">sara@example.com</td>
                <td className="border-b px-3 py-2">pass456</td>
                <td className="border-b px-3 py-2">user</td>
                <td className="border-b px-3 py-2">(blank — uses import default)</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="font-medium text-gray-900">Import behaviour</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Duplicate emails are skipped (existing account kept)</li>
          <li>Invalid constituency names are reported as row errors</li>
          <li>After import, a summary shows created, skipped, and error counts</li>
        </ul>
      </Section>

      <Section title="Select and delete users">
        <ul className="list-disc space-y-1 pl-5">
          <li>Click a row or checkbox to select a user</li>
          <li>Shift+click another row to select everyone in between</li>
          <li>Use the header checkbox to select all deletable users in the current tab</li>
          <li>
            Click <strong>Delete selected</strong>, confirm in the dialog, then users are permanently
            removed
          </li>
          <li>Admin users cannot be selected or deleted</li>
        </ul>
      </Section>

      <Section title="Related">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <HelpLink href="/dashboard/help/constituency">Constituency</HelpLink> — Halka names used
            for constituency access
          </li>
          <li>
            <HelpLink href="/dashboard/users">Users</HelpLink> — open User Management
          </li>
        </ul>
      </Section>
    </div>
  );
}
