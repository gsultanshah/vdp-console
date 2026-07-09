import { NextResponse } from 'next/server';
import { forbiddenResponse, requireAdmin, unauthorizedResponse } from '@/lib/auth';
import { canAccessHalka } from '@/lib/constituency-access';
import { deleteDesign, getDesignById, updateDesign } from '@/lib/voter-parchi/job-service';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const design = await getDesignById(params.id);
    if (!design) {
      return NextResponse.json({ error: 'Design not found' }, { status: 404 });
    }
    return NextResponse.json({ design });
  } catch (error) {
    console.error('Get parchi design failed:', error);
    return NextResponse.json({ error: 'Failed to load design' }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const admin = requireAdmin(request);
  if (!admin) {
    const hasSession = request.headers.get('cookie')?.includes('user=');
    return hasSession ? forbiddenResponse() : unauthorizedResponse();
  }

  try {
    const existing = await getDesignById(params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Design not found' }, { status: 404 });
    }
    if (!canAccessHalka(admin, existing.halkaName)) {
      return forbiddenResponse();
    }

    const body = (await request.json()) as Record<string, unknown>;
    const design = await updateDesign(params.id, body as never);
    return NextResponse.json({ design });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update design';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const admin = requireAdmin(request);
  if (!admin) {
    const hasSession = request.headers.get('cookie')?.includes('user=');
    return hasSession ? forbiddenResponse() : unauthorizedResponse();
  }

  try {
    const existing = await getDesignById(params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Design not found' }, { status: 404 });
    }
    if (!canAccessHalka(admin, existing.halkaName)) {
      return forbiddenResponse();
    }

    await deleteDesign(params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete design' }, { status: 500 });
  }
}
