'use client';

import Link from 'next/link';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

export function HelpPageHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <Link
        href="/dashboard/help"
        className="inline-flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-800"
      >
        <ArrowLeftIcon className="mr-1 h-4 w-4" />
        Back to Help
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-gray-900 sm:text-3xl">{title}</h1>
      <p className="mt-2 text-gray-600">{description}</p>
    </div>
  );
}

export function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-gray-900 px-4 py-3 text-sm text-gray-100">
      <code>{children}</code>
    </pre>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      <div className="mt-4 space-y-4 text-sm text-gray-700">{children}</div>
    </section>
  );
}

export function HelpLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-medium text-indigo-600 hover:text-indigo-800">
      {children}
    </Link>
  );
}
