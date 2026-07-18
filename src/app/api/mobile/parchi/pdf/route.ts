import { ObjectId } from 'mongodb';
import { connectNativeMongoClient, getVdpDb } from '@/lib/mongo-client';
import { resolveMobileSession } from '@/lib/mobile/auth';
import { getAccessCodeByCode } from '@/lib/mobile/access-codes';
import { isBlockCodeAllowed } from '@/lib/mobile/block-access';
import { resolveParchiDesignForMobile } from '@/lib/mobile/parchi-design';
import { buildParchiPdfBuffer } from '@/lib/voter-parchi/pdf-generator';
import { enrichVotersWithPolling } from '@/lib/voter-parchi/voter-data';
import type { VoterParchiDesign } from '@/lib/voter-parchi/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Generate a single-voter parchi PDF using the mobile login's selected design
 * (or the constituency default). Used by the Flutter app for preview/export.
 */
export async function POST(request: Request) {
  const client = await connectNativeMongoClient();
  const db = getVdpDb(client);

  try {
    const session = await resolveMobileSession(request, db);
    if (!session || session.type !== 'user' || !session.halkaName || !session.accessCode) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as {
      voterId?: string;
      cnic?: string;
      blockCode?: string;
    };

    const access = await getAccessCodeByCode(db, session.accessCode);
    if (!access) {
      return Response.json({ error: 'Access code not found' }, { status: 403 });
    }

    const halkaName = session.halkaName.replace(/\s+/g, '').toUpperCase();
    const filter: Record<string, unknown> = { halkaName };

    if (body.voterId && ObjectId.isValid(body.voterId)) {
      filter._id = new ObjectId(body.voterId);
    } else if (body.cnic?.trim()) {
      filter.cnic = body.cnic.trim();
      if (body.blockCode?.trim()) {
        filter.blockCode = body.blockCode.trim();
      }
    } else {
      return Response.json({ error: 'voterId or cnic is required' }, { status: 400 });
    }

    const voterDoc = await db.collection('voters').findOne(filter);
    if (!voterDoc) {
      return Response.json({ error: 'Voter not found' }, { status: 404 });
    }

    const blockCode = String(voterDoc.blockCode ?? '');
    if (blockCode && !isBlockCodeAllowed(access, blockCode)) {
      return Response.json({ error: 'Block code not allowed for this login' }, { status: 403 });
    }

    const designRecord = await resolveParchiDesignForMobile(db, halkaName, access);
    const design = designRecord as unknown as VoterParchiDesign;
    if (!design?._id && !design?.slots && !design?.canvas) {
      return Response.json({ error: 'No voter parchi design available' }, { status: 404 });
    }

    const enriched = await enrichVotersWithPolling(db, halkaName, [
      voterDoc as Record<string, unknown>,
    ]);
    if (enriched.length === 0) {
      return Response.json({ error: 'Failed to prepare voter for parchi' }, { status: 500 });
    }

    const pdfBuffer = await buildParchiPdfBuffer(halkaName, design, enriched);
    const safeCnic = String(enriched[0].cnic ?? 'voter').replace(/\D/g, '') || 'voter';
    const fileName = `parchi-${safeCnic}.pdf`;

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${fileName}"`,
        'Cache-Control': 'no-store',
        'X-Parchi-Design-Id': String(design._id ?? ''),
        'X-Parchi-Design-Name': encodeURIComponent(String(design.name ?? '')),
      },
    });
  } catch (error) {
    console.error('Mobile parchi PDF failed:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to generate parchi' },
      { status: 500 }
    );
  } finally {
    await client.close();
  }
}
