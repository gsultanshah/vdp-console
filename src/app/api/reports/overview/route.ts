import { NextResponse } from 'next/server';

/** @deprecated Use GET /api/reports/stream/ for progressive NDJSON loading */
export async function GET() {
  return NextResponse.json(
    {
      error: 'Use /api/reports/stream/ for progressive reports loading',
    },
    { status: 410 }
  );
}
