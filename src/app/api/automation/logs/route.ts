import { NextResponse } from 'next/server';
import { forbiddenResponse, requireAdmin, unauthorizedResponse } from '@/lib/auth';
import { queryAutomationLogs } from '@/lib/automation-logs';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const admin = requireAdmin(request);
  if (!admin) {
    const hasSession = request.headers.get('cookie')?.includes('user=');
    return hasSession ? forbiddenResponse() : unauthorizedResponse();
  }

  try {
    const { searchParams } = new URL(request.url);
    const items = await queryAutomationLogs({
      halkaName: searchParams.get('halkaName') || undefined,
      level: searchParams.get('level') || undefined,
      action: searchParams.get('action') || undefined,
      q: searchParams.get('q') || undefined,
      limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : 50,
      before: searchParams.get('before') || undefined,
    });
    return NextResponse.json({ items });
  } catch (error) {
    console.error('automation logs query failed', error);
    return NextResponse.json({ error: 'Failed to load automation logs' }, { status: 500 });
  }
}
