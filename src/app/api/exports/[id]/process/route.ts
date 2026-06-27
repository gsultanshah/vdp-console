import { NextResponse } from 'next/server';
import { forbiddenResponse, requireAdmin, unauthorizedResponse } from '@/lib/auth';
import { processExportBatch } from '@/lib/voter-export';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const admin = requireAdmin(request);
  if (!admin) {
    const hasSession = request.headers.get('cookie')?.includes('user=');
    return hasSession ? forbiddenResponse() : unauthorizedResponse();
  }

  try {
    const job = await processExportBatch(params.id);
    if (!job) {
      return NextResponse.json({ error: 'Export job not found' }, { status: 404 });
    }
    return NextResponse.json({ job });
  } catch (error) {
    console.error('Export batch failed:', error);
    return NextResponse.json({ error: 'Failed to process export batch' }, { status: 500 });
  }
}
