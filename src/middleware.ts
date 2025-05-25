import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    // If the user is authenticated and tries to access auth pages, redirect to dashboard
    if (
      req.nextUrl.pathname.startsWith('/signin') ||
      req.nextUrl.pathname.startsWith('/signup')
    ) {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  matcher: ['/dashboard/:path*', '/signin', '/signup'],
}; 