import { NextResponse } from 'next/server';
import { forbiddenResponse, getUserFromRequest, unauthorizedResponse } from '@/lib/auth';
import { canAccessHalka } from '@/lib/constituency-access';
import { connectNativeMongoClient } from '@/lib/mongo-client';
import { getDesignById } from '@/lib/voter-parchi/job-service';
import { buildParchiPdfBuffer } from '@/lib/voter-parchi/pdf-generator';
import { SAMPLE_PARCHI_VOTER } from '@/lib/voter-parchi/canvas-utils';
import { fetchParchiPreviewVoters } from '@/lib/voter-parchi/voter-data';
import type { VoterParchiDesign } from '@/lib/voter-parchi/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const user = getUserFromRequest(request);
  if (!user) {
    return unauthorizedResponse();
  }

  try {
    const design = await getDesignById(params.id);
    if (!design) {
      return NextResponse.json({ error: 'Design not found' }, { status: 404 });
    }
    if (!canAccessHalka(user, design.halkaName)) {
      return forbiddenResponse();
    }

    const body = (await request.json().catch(() => ({}))) as Partial<VoterParchiDesign> & {
      slipWidthMm?: number;
      slipHeightMm?: number;
      blockCode?: string;
    };

    const blockCode = String(body.blockCode ?? '').trim();
    if (!blockCode) {
      return NextResponse.json({ error: 'blockCode is required for preview PDF' }, { status: 400 });
    }

    const baseCanvas = body.canvas ?? design.canvas;
    const merged: VoterParchiDesign = {
      ...design,
      layoutMode: 'canvas',
      canvas: baseCanvas
        ? {
            ...baseCanvas,
            slipWidthMm: body.slipWidthMm ?? baseCanvas.slipWidthMm,
            slipHeightMm: body.slipHeightMm ?? baseCanvas.slipHeightMm,
          }
        : null,
      parchiPerPage: body.parchiPerPage ?? design.parchiPerPage,
      symbolAssetId: body.symbolAssetId ?? design.symbolAssetId,
      photoAssetId: body.photoAssetId ?? design.photoAssetId,
    };

    if (!merged.canvas) {
      return NextResponse.json({ error: 'Canvas design required for preview' }, { status: 400 });
    }

    const perPage = Math.max(1, Math.min(5, merged.parchiPerPage || 1));

    const client = await connectNativeMongoClient();
    let voters;
    try {
      const db = client.db('vdp');
      voters = await fetchParchiPreviewVoters(db, merged.halkaName, blockCode, perPage);
    } finally {
      await client.close();
    }

    if (voters.length === 0) {
      return NextResponse.json(
        { error: `No voters found for block code ${blockCode}` },
        { status: 404 }
      );
    }

    // Pad to fill one printed page when the block has fewer voters than perPage.
    while (voters.length < perPage) {
      voters.push({ ...voters[voters.length % voters.length] });
    }

    const buffer = await buildParchiPdfBuffer(merged.halkaName, merged, voters.slice(0, perPage));
    const safeBlock = blockCode.replace(/\D/g, '') || blockCode;
    const fileName = `${merged.halkaName.replace(/\s+/g, '')}-${safeBlock}-parchi-preview.pdf`;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Parchi preview PDF failed:', error);
    const message = error instanceof Error ? error.message : 'Preview PDF failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
