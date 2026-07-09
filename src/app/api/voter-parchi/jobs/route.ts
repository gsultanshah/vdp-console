import { NextResponse } from 'next/server';
import { forbiddenResponse, getUserFromRequest, requireAdmin, unauthorizedResponse } from '@/lib/auth';
import { canAccessHalka } from '@/lib/constituency-access';
import { createParchiJob, listParchiJobs } from '@/lib/voter-parchi/job-service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const halkaName = searchParams.get('halkaName') ?? '';
  if (!halkaName) {
    return NextResponse.json({ error: 'halkaName is required' }, { status: 400 });
  }

  const user = getUserFromRequest(request);
  if (!user) return unauthorizedResponse();
  if (!canAccessHalka(user, halkaName)) return forbiddenResponse();

  try {
    const jobs = await listParchiJobs(halkaName);
    return NextResponse.json({ jobs });
  } catch (error) {
    console.error('List parchi jobs failed:', error);
    return NextResponse.json({ error: 'Failed to load jobs' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const admin = requireAdmin(request);
  if (!admin) {
    const hasSession = request.headers.get('cookie')?.includes('user=');
    return hasSession ? forbiddenResponse() : unauthorizedResponse();
  }

  try {
    const body = (await request.json()) as {
      halkaName?: string;
      designId?: string;
      blockCodes?: string[];
      selectAllBlockCodes?: boolean;
      genderFilter?: 'both' | 'male' | 'female';
    };

    if (!body.halkaName || !body.designId) {
      return NextResponse.json({ error: 'halkaName and designId are required' }, { status: 400 });
    }

    if (!canAccessHalka(admin, body.halkaName)) {
      return forbiddenResponse();
    }

    const job = await createParchiJob({
      halkaName: body.halkaName,
      designId: body.designId,
      blockCodes: body.blockCodes,
      selectAllBlockCodes: body.selectAllBlockCodes ?? true,
      genderFilter: body.genderFilter ?? 'both',
      createdBy: admin.email,
      createdByName: admin.name,
    });

    return NextResponse.json({ job });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create job';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
