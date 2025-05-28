'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AuthLayout from '@/components/auth/AuthLayout';
import { Suspense } from 'react';

// Mark this page as dynamic
export const dynamic = 'force-dynamic';

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  const getErrorMessage = (error: string | null) => {
    switch (error) {
      case 'Configuration':
        return 'There is a problem with the server configuration. Please contact support.';
      case 'AccessDenied':
        return 'You do not have permission to access this resource.';
      case 'Verification':
        return 'The verification link may have expired or already been used.';
      default:
        return 'An error occurred during authentication. Please try again.';
    }
  };

  return (
    <AuthLayout
      title="Authentication Error"
      subtitle="Something went wrong"
    >
      <div className="text-center">
        <div className="mb-4 text-red-600">
          {getErrorMessage(error)}
        </div>
        <Link
          href="/signin"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          Return to Sign In
        </Link>
      </div>
    </AuthLayout>
  );
}

export default function AuthError() {
  return (
    <Suspense fallback={
      <AuthLayout
        title="Authentication Error"
        subtitle="Loading..."
      >
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500 mx-auto"></div>
        </div>
      </AuthLayout>
    }>
      <AuthErrorContent />
    </Suspense>
  );
} 