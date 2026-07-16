'use client';

import Link from 'next/link';
import {
  ArrowRightIcon,
  CloudArrowUpIcon,
  DevicePhoneMobileIcon,
  MapIcon,
  MagnifyingGlassIcon,
  Cog6ToothIcon,
  CommandLineIcon,
  UserGroupIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';

const helpTopics = [
  {
    title: 'VDP Mobile',
    description:
      'Field app guide — 6-digit login, online/offline search, block downloads, parchi, sharing, and usage logs.',
    href: '/dashboard/help/vdp-mobile',
    icon: DevicePhoneMobileIcon,
  },
  {
    title: 'Constituency',
    description:
      'Halka home, block codes table, voter parchi (with polling station), missing-polling filter, and admin block-code rename.',
    href: '/dashboard/help/constituency',
    icon: MapIcon,
  },
  {
    title: 'Voter Parchi Designer',
    description:
      'Design voter slip layouts — design codes (e.g. la39d01), canvas editor, A4 preview, and bulk PDF generation.',
    href: '/dashboard/help/voter-parchi-designer',
    icon: SparklesIcon,
  },
  {
    title: 'Search Voters',
    description:
      'Search by CNIC, view voter list images, polling station info, and family members.',
    href: '/dashboard/help/search-voters',
    icon: MagnifyingGlassIcon,
  },
  {
    title: 'Data Processing',
    description:
      'Create constituencies, add voters manually, import polling schemes, and view data reports.',
    href: '/dashboard/help/data-processing',
    icon: Cog6ToothIcon,
  },
  {
    title: 'CLI Commands',
    description:
      'OCR, enrich, export-voters, and export-parchi (design codes + interactive polling station prompts).',
    href: '/dashboard/help/cli-commands',
    icon: CommandLineIcon,
  },
  {
    title: 'User Management',
    description:
      'Create users, assign constituency access, bulk import from Excel, and manage admin accounts.',
    href: '/dashboard/help/user-management',
    icon: UserGroupIcon,
  },
  {
    title: 'VDP Image Uploader',
    description:
      'Upload voter list images to server storage and store metadata in the database using the CLI uploader.',
    href: '/dashboard/help/vdp-uploader',
    icon: CloudArrowUpIcon,
  },
];

export default function HelpPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Help</h1>
        <p className="mt-2 text-sm text-gray-600">
          Documentation and guides for VDP Console tools, the mobile field app, and workflows.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {helpTopics.map((topic) => (
          <Link
            key={topic.href}
            href={topic.href}
            className="group rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition hover:border-indigo-300 hover:shadow-md"
          >
            <div className="flex items-start gap-4">
              <div className="rounded-lg bg-indigo-50 p-3">
                <topic.icon className="h-6 w-6 text-indigo-600" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-gray-900 group-hover:text-indigo-600">
                  {topic.title}
                </h2>
                <p className="mt-1 text-sm text-gray-600">{topic.description}</p>
                <span className="mt-3 inline-flex items-center text-sm font-medium text-indigo-600">
                  View guide
                  <ArrowRightIcon className="ml-1 h-4 w-4 transition group-hover:translate-x-0.5" />
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
