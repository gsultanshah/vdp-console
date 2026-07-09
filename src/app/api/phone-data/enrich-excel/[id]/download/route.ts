import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import { forbiddenResponse, requireAdmin, unauthorizedResponse } from '@/lib/auth';
import { getPhoneEnrichJob, getPhoneEnrichResultPath } from '@/lib/phone-enrich/job-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const admin = requireAdmin(request);
  if (!admin) {
    const hasSession = request.headers.get('cookie')?.includes('user=');
    return hasSession ? forbiddenResponse() : unauthorizedResponse();
  }

  const job = await getPhoneEnrichJob(params.id);
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  if (!job.downloadReady) {
    return NextResponse.json({ error: 'Result not ready yet' }, { status: 400 });
  }

  const filePath = await getPhoneEnrichResultPath(params.id);
  if (!filePath) {
    return NextResponse.json({ error: 'Result file missing' }, { status: 404 });
  }

  const buffer = await fs.readFile(filePath);
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="phone-enriched-${params.id.slice(0, 8)}.xlsx"`,
    },
  });
}
