import { NextResponse } from 'next/server';
import { forbiddenResponse, getUserFromRequest, requireAdmin, unauthorizedResponse } from '@/lib/auth';
import { canAccessHalka } from '@/lib/constituency-access';
import {
  createDesign,
  ensureDefaultDesign,
  listDesigns,
} from '@/lib/voter-parchi/job-service';

export const dynamic = 'force-dynamic';

function accessGuard(request: Request, halkaName: string) {
  const user = getUserFromRequest(request);
  if (!user) return { user: null, response: unauthorizedResponse() };
  if (!canAccessHalka(user, halkaName)) return { user: null, response: forbiddenResponse() };
  return { user, response: null };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const halkaName = searchParams.get('halkaName') ?? '';
  if (!halkaName) {
    return NextResponse.json({ error: 'halkaName is required' }, { status: 400 });
  }

  const { response } = accessGuard(request, halkaName);
  if (response) return response;

  try {
    let designs = await listDesigns(halkaName);
    if (designs.length === 0) {
      const defaultDesign = await ensureDefaultDesign(halkaName);
      designs = [defaultDesign];
    }
    return NextResponse.json({ designs });
  } catch (error) {
    console.error('List parchi designs failed:', error);
    return NextResponse.json({ error: 'Failed to load designs' }, { status: 500 });
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
      name?: string;
      description?: string;
      isDefault?: boolean;
      parchiPerPage?: number;
      slots?: unknown;
      customHeaderText?: string;
      symbolAssetId?: string | null;
      photoAssetId?: string | null;
    };

    if (!body.halkaName || !body.name) {
      return NextResponse.json({ error: 'halkaName and name are required' }, { status: 400 });
    }

    if (!canAccessHalka(admin, body.halkaName)) {
      return forbiddenResponse();
    }

    const design = await createDesign(
      {
        halkaName: body.halkaName,
        name: body.name,
        description: body.description,
        isDefault: body.isDefault,
        parchiPerPage: body.parchiPerPage,
        slots: body.slots as never,
        customHeaderText: body.customHeaderText,
        symbolAssetId: body.symbolAssetId,
        photoAssetId: body.photoAssetId,
      },
      admin.email,
      admin.name
    );

    return NextResponse.json({ design });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create design';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
