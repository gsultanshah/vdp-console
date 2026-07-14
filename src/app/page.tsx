import Link from 'next/link';
import { MotionDiv } from '@/components/ui/Motion';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <nav className="fixed w-full bg-white/80 backdrop-blur-md z-50 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex-shrink-0">
              <h1 className="text-2xl font-bold text-indigo-600">Voter Data Processor</h1>
            </div>
            <div className="hidden md:block">
              <div className="ml-10 flex items-center space-x-4">
                <Link
                  href="/signin"
                  className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
                >
                  Sign In
                </Link>
                <Link
                  href="/signup"
                  className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700"
                >
                  Get Started
                </Link>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <div className="pt-24 pb-16 sm:pt-32 sm:pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <MotionDiv
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center"
          >
            <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
              Built for Pakistan election campaigns
            </p>
            <h1 className="mt-3 text-4xl tracking-tight font-extrabold text-gray-900 sm:text-5xl md:text-6xl">
              <span className="block">Turn voter lists into</span>
              <span className="block text-indigo-600">campaign-ready intelligence</span>
            </h1>
            <p className="mt-5 max-w-3xl mx-auto text-lg text-gray-600 md:text-xl">
              Digitize Election Commission voter rolls, search any voter in seconds, print branded
              parchi slips, and put a pocket voter desk in every field worker&apos;s hand — even
              where there is no internet.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center px-8 py-3 text-base font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 md:py-4 md:text-lg"
              >
                Get Started Free
              </Link>
              <Link
                href="/signin"
                className="inline-flex items-center justify-center px-8 py-3 text-base font-medium rounded-md text-indigo-600 bg-white border border-gray-200 hover:bg-gray-50 md:py-4 md:text-lg"
              >
                Sign In
              </Link>
            </div>
          </MotionDiv>
        </div>
      </div>

      {/* Audiences */}
      <div className="py-16 bg-white border-y border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <h2 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
              One platform, every role on your campaign
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              From headquarters to the doorstep — everyone works from the same trusted voter data.
            </p>
          </div>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {audiences.map((audience) => (
              <MotionDiv
                key={audience.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="rounded-2xl border border-gray-100 bg-gray-50 p-8"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white text-xl font-bold">
                  {audience.initial}
                </div>
                <h3 className="mt-5 text-xl font-bold text-gray-900">{audience.title}</h3>
                <p className="mt-2 text-gray-600">{audience.summary}</p>
                <ul className="mt-5 space-y-2">
                  {audience.highlights.map((item) => (
                    <li key={item} className="flex gap-2 text-sm text-gray-700">
                      <span className="text-indigo-600 font-bold">✓</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </MotionDiv>
            ))}
          </div>
        </div>
      </div>

      {/* VDP Console */}
      <FeatureSection
        eyebrow="VDP Console"
        title="Your campaign command center"
        description="Search voters, understand households, track block progress, and run reports — all from one web dashboard scoped to your constituency."
        features={consoleFeatures}
      />

      {/* VDP Mobile */}
      <FeatureSection
        eyebrow="VDP Mobile"
        title="A voter desk in every pocket"
        description="Give field workers a simple app to look up voters, print parchi slips, and share information — online or completely offline."
        features={mobileFeatures}
        alternate
      />

      {/* Data operations */}
      <FeatureSection
        eyebrow="Data & operations"
        title="Election-ready data, end to end"
        description="Upload scanned voter lists, import polling schemes, generate parchi at scale, and keep your entire team provisioned and accountable."
        features={operationsFeatures}
      />

      {/* How it works */}
      <div className="py-16 bg-indigo-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-extrabold text-white sm:text-4xl">How campaigns get started</h2>
            <p className="mt-4 text-lg text-indigo-100 max-w-2xl mx-auto">
              Go from paper voter lists to a field-ready operation in three straightforward steps.
            </p>
          </div>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {steps.map((step, index) => (
              <div key={step.title} className="text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white text-indigo-600 text-xl font-bold">
                  {index + 1}
                </div>
                <h3 className="mt-5 text-xl font-bold text-white">{step.title}</h3>
                <p className="mt-2 text-indigo-100">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Benefits */}
      <div className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <h2 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
              Why campaigns choose VDP
            </h2>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {benefits.map((benefit) => (
              <MotionDiv
                key={benefit.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="rounded-xl border border-gray-100 p-6"
              >
                <h3 className="text-lg font-semibold text-gray-900">{benefit.title}</h3>
                <p className="mt-2 text-sm text-gray-600">{benefit.description}</p>
              </MotionDiv>
            ))}
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="py-16 bg-gray-50 border-t border-gray-100">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-extrabold text-gray-900">
            Ready to organize your voter data?
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            Set up your constituency, invite your team, and start searching voters today.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center px-8 py-3 text-base font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
            >
              Create Your Account
            </Link>
            <Link
              href="/signin"
              className="inline-flex items-center justify-center px-8 py-3 text-base font-medium rounded-md text-indigo-600 bg-white border border-gray-200 hover:bg-gray-50"
            >
              Sign In
            </Link>
          </div>
        </div>
      </div>

      <footer className="py-8 border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-gray-500">
          © {new Date().getFullYear()} Voter Data Processor. Built for election campaigns across Pakistan.
        </div>
      </footer>
    </div>
  );
}

function FeatureSection({
  eyebrow,
  title,
  description,
  features,
  alternate = false,
}: {
  eyebrow: string;
  title: string;
  description: string;
  features: { name: string; description: string }[];
  alternate?: boolean;
}) {
  return (
    <div className={`py-16 ${alternate ? 'bg-gray-50' : 'bg-white'}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">{eyebrow}</p>
          <h2 className="mt-2 text-3xl font-extrabold text-gray-900 sm:text-4xl">{title}</h2>
          <p className="mt-4 text-lg text-gray-600">{description}</p>
        </div>
        <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <MotionDiv
              key={feature.name}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              <h3 className="text-lg font-semibold text-gray-900">{feature.name}</h3>
              <p className="mt-2 text-gray-600">{feature.description}</p>
            </MotionDiv>
          ))}
        </div>
      </div>
    </div>
  );
}

const audiences = [
  {
    initial: 'M',
    title: 'Campaign managers',
    summary: 'See the full picture of your constituency and make faster outreach decisions.',
    highlights: [
      'Search any voter by CNIC, name, or household number',
      'View entire families from a single lookup',
      'Reports, charts, and downloadable summaries',
      'Track which blocks are ready for the field',
    ],
  },
  {
    initial: 'F',
    title: 'Field workers',
    summary: 'Look up voters at the door, print parchi slips, and share details on the spot.',
    highlights: [
      'Simple 6-digit code login — no email needed',
      'Search online or offline after downloading a block',
      'Print branded voter parchi from any result',
      'Share voter cards with your team instantly',
    ],
  },
  {
    initial: 'A',
    title: 'Data & admin teams',
    summary: 'Turn scanned voter lists into clean, searchable records your whole campaign can use.',
    highlights: [
      'Upload and process ECP voter list pages',
      'Import polling schemes with station and booth details',
      'Generate parchi PDFs for entire blocks at once',
      'Provision mobile access and monitor field activity',
    ],
  },
];

const consoleFeatures = [
  {
    name: 'Instant voter search',
    description:
      'Find any voter by CNIC, name, silsila number, or household number — with full profile details and the original list row.',
  },
  {
    name: 'Household intelligence',
    description:
      'See every voter in the same gharana from one search. Plan household-level outreach instead of one voter at a time.',
  },
  {
    name: 'Polling station details',
    description:
      'Station name, area, booth numbers, and male/female counts appear on voter profiles when polling data is loaded.',
  },
  {
    name: 'Constituency dashboard',
    description:
      'Voter totals, gender and religion breakdowns, block counts, and processing progress at a glance.',
  },
  {
    name: 'Block-by-block organization',
    description:
      'Browse every block code in your constituency, open a dedicated hub for each, and track work status through to verified.',
  },
  {
    name: 'Reports & exports',
    description:
      'Interactive charts across constituencies, blocks, voters, and work progress — with spreadsheet downloads where permitted.',
  },
  {
    name: 'Phone number lookup',
    description:
      'Search contact numbers linked to voters and enrich your outreach lists alongside voter records.',
  },
  {
    name: 'Scoped team access',
    description:
      'Each user sees only the constituencies and permissions assigned to them — managers stay focused, admins stay in control.',
  },
  {
    name: 'In-app guides',
    description:
      'Step-by-step help for voter search, constituency management, mobile provisioning, and everyday campaign workflows.',
  },
];

const mobileFeatures = [
  {
    name: '6-digit field login',
    description:
      'Workers enter a short access code from their manager — locked to one constituency and assigned blocks.',
  },
  {
    name: 'Online & offline search',
    description:
      'Search live data when connected, or switch to offline mode using voter blocks saved on the device.',
  },
  {
    name: 'Download blocks for the field',
    description:
      'Pull down a block\'s voters before heading to areas with poor signal. Pause, resume, or cancel large downloads.',
  },
  {
    name: 'Voter parchi on demand',
    description:
      'Generate, preview, download, or print branded voter slips straight from any search result.',
  },
  {
    name: 'WhatsApp-ready sharing',
    description:
      'Send a voter card image with name, CNIC, and list row to coordinators or team members in one tap.',
  },
  {
    name: 'Campaign-branded experience',
    description:
      'Your colors, logo, and app title follow each access code so the field app feels like your campaign.',
  },
];

const operationsFeatures = [
  {
    name: 'Voter list digitization',
    description:
      'Upload scanned pages or PDFs, turn them into searchable voter records, and review progress as each block completes.',
  },
  {
    name: 'Polling scheme management',
    description:
      'Import station lists from spreadsheets or documents, edit rows, and attach polling details to every voter profile.',
  },
  {
    name: 'Bulk parchi production',
    description:
      'Design your parchi layout once, then generate slips for a single block, selected blocks, or an entire constituency.',
  },
  {
    name: 'Custom parchi designs',
    description:
      'Add your symbol, photo area, header, and voter detail fields — then reuse the design across every generation job.',
  },
  {
    name: 'Voter record editing',
    description:
      'Browse, add, and correct voter entries block by block with row images side by side for quality assurance.',
  },
  {
    name: 'Spreadsheet exports',
    description:
      'Export voters with the columns you need — name, CNIC, gender, address, block, silsila, gharana, phone, and more.',
  },
  {
    name: 'Mobile team provisioning',
    description:
      'Create access codes in bulk, assign blocks, set branding, and enable or disable field logins instantly.',
  },
  {
    name: 'Field activity visibility',
    description:
      'See who searched, printed, downloaded, or shared — with optional location when workers allow it.',
  },
  {
    name: 'Constituency lifecycle',
    description:
      'Create, activate, estimate voter counts, and manage multiple constituencies from a single admin workspace.',
  },
];

const steps = [
  {
    title: 'Upload your voter lists',
    description:
      'Bring in scanned ECP pages by constituency and block. VDP turns them into structured, searchable voter records.',
  },
  {
    title: 'Organize and verify',
    description:
      'Import polling schemes, review blocks, track progress, and generate parchi so headquarters and the field stay aligned.',
  },
  {
    title: 'Deploy to your team',
    description:
      'Issue mobile access codes, download blocks for offline areas, and give every worker voter lookup at their fingertips.',
  },
];

const benefits = [
  {
    title: 'Faster outreach',
    description: 'Find any voter or household in seconds instead of flipping through paper lists.',
  },
  {
    title: 'Polling-day ready',
    description: 'Station names, booth numbers, and voter details in one place for door-to-door and day-of coordination.',
  },
  {
    title: 'Works in the field',
    description: 'Offline block downloads mean your team keeps working even without mobile signal.',
  },
  {
    title: 'Your brand, everywhere',
    description: 'Branded mobile app and parchi slips that look like your campaign, not a generic tool.',
  },
];
