import Link from 'next/link';

interface PublicSiteShellProps {
  children: React.ReactNode;
}

export function PublicSiteShell({ children }: PublicSiteShellProps) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <nav className="sticky top-0 z-50 border-b border-gray-100 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="text-xl font-bold text-indigo-600">
            Voter Data Processor
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/signin"
              className="hidden rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 sm:inline"
            >
              Sign In
            </Link>
            <Link
              href="/signup"
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      <main>{children}</main>

      <footer className="border-t border-gray-100 py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <p className="text-sm text-gray-500">
              © {new Date().getFullYear()} Voter Data Processor. Built for election campaigns across
              Pakistan.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
              <Link href="/privacy-policy" className="text-gray-600 hover:text-indigo-600">
                Privacy Policy
              </Link>
              <Link href="/terms-of-use" className="text-gray-600 hover:text-indigo-600">
                Terms of Use
              </Link>
              <Link href="/signin" className="text-gray-600 hover:text-indigo-600">
                Sign In
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
