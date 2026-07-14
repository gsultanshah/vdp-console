import Link from 'next/link';
import { PublicSiteShell } from '@/components/marketing/PublicSiteShell';

export interface LegalSection {
  title: string;
  paragraphs: string[];
  bullets?: string[];
}

interface LegalPageProps {
  title: string;
  description: string;
  lastUpdated: string;
  sections: LegalSection[];
  relatedLink?: { href: string; label: string };
}

export function LegalPage({
  title,
  description,
  lastUpdated,
  sections,
  relatedLink,
}: LegalPageProps) {
  return (
    <PublicSiteShell>
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="mb-10">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Legal</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            {title}
          </h1>
          <p className="mt-4 text-lg text-gray-600">{description}</p>
          <p className="mt-3 text-sm text-gray-400">Last updated: {lastUpdated}</p>
        </div>

        <div className="space-y-10">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-xl font-semibold text-gray-900">{section.title}</h2>
              <div className="mt-3 space-y-3 text-gray-600 leading-relaxed">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
              {section.bullets && section.bullets.length > 0 ? (
                <ul className="mt-3 list-disc space-y-2 pl-5 text-gray-600 leading-relaxed">
                  {section.bullets.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>

        {relatedLink ? (
          <p className="mt-12 border-t border-gray-100 pt-8 text-sm text-gray-500">
            See also{' '}
            <Link href={relatedLink.href} className="font-medium text-indigo-600 hover:text-indigo-700">
              {relatedLink.label}
            </Link>
            .
          </p>
        ) : null}
      </div>
    </PublicSiteShell>
  );
}
