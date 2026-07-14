import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { forbiddenResponse, requireAdmin, unauthorizedResponse } from '@/lib/auth';
import { canAccessHalka } from '@/lib/constituency-access';
import { uploadBufferToFirebaseStorage } from '@/lib/firebase-storage';
import { addDesignAsset, getDesignById } from '@/lib/voter-parchi/job-service';
import { DEFAULT_SLIP_HEIGHT_MM, DEFAULT_SLIP_WIDTH_MM } from '@/lib/voter-parchi/canvas-layout';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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
    const design = await getDesignById(params.id);
    if (!design) {
      return NextResponse.json({ error: 'Design not found' }, { status: 404 });
    }
    if (!canAccessHalka(admin, design.halkaName)) {
      return forbiddenResponse();
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const role = String(formData.get('role') ?? 'other') as
      | 'symbol'
      | 'photo'
      | 'header'
      | 'background'
      | 'other';
    const name = String(formData.get('name') ?? 'asset');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }

    const maxBytes = 1024 * 1024;
    if (file.size > maxBytes) {
      return NextResponse.json({ error: 'Image must be 1 MB or smaller' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const assetId = randomUUID();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_');
    const storagePath = `${design.halkaName}/voter-parchi-assets/${params.id}/${assetId}-${safeName}`;
    const url = await uploadBufferToFirebaseStorage(buffer, storagePath, file.type || 'image/png');

    const asset = {
      id: assetId,
      name: name || safeName,
      url,
      storagePath,
      contentType: file.type || 'image/png',
      role,
      uploadedAt: new Date().toISOString(),
    };

    const updated = await addDesignAsset(params.id, asset);
    if (!updated) {
      return NextResponse.json({ error: 'Failed to save asset' }, { status: 500 });
    }

    const patch: Record<string, unknown> = {};
    if (role === 'symbol') patch.symbolAssetId = assetId;
    if (role === 'photo') patch.photoAssetId = assetId;
    if (role === 'header') patch.headerAssetId = assetId;
    if (role === 'background') {
      const canvas = design.canvas ?? {
        slipWidthMm: DEFAULT_SLIP_WIDTH_MM,
        slipHeightMm: DEFAULT_SLIP_HEIGHT_MM,
        elements: [],
      };
      patch.canvas = { ...canvas, backgroundAssetId: assetId };
    }

    if (Object.keys(patch).length > 0) {
      const { updateDesign } = await import('@/lib/voter-parchi/job-service');
      await updateDesign(params.id, patch as never);
    }

    const refreshed = await getDesignById(params.id);
    return NextResponse.json({ design: refreshed, asset });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Asset upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
