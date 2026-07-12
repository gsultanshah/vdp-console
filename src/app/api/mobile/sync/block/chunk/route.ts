import { NextResponse } from 'next/server';
import { connectNativeMongoClient, getVdpDb } from '@/lib/mongo-client';
import { resolveMobileSession } from '@/lib/mobile/auth';
import { buildMobileBlockSyncChunk } from '@/lib/mobile/sync';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const client = await connectNativeMongoClient();
  const db = getVdpDb(client);

  try {
    const session = await resolveMobileSession(request, db);
    if (!session || session.type !== 'user' || !session.halkaName) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const blockCode = searchParams.get('blockCode')?.trim();
    const chunkRaw = searchParams.get('chunk');
    const chunkSizeRaw = searchParams.get('chunkSize');

    if (!blockCode) {
      return NextResponse.json({ error: 'blockCode is required' }, { status: 400 });
    }

    const chunkIndex = Number.parseInt(chunkRaw ?? '0', 10);
    if (!Number.isFinite(chunkIndex) || chunkIndex < 0) {
      return NextResponse.json({ error: 'Invalid chunk index' }, { status: 400 });
    }

    const chunkSize = chunkSizeRaw ? Number.parseInt(chunkSizeRaw, 10) : undefined;

    const chunk = await buildMobileBlockSyncChunk(db, {
      halkaName: session.halkaName,
      blockCode,
      chunkIndex,
      chunkSize: Number.isFinite(chunkSize) ? chunkSize : undefined,
      accessCode: session.accessCode,
    });

    if (!chunk) {
      return NextResponse.json({ error: 'Block chunk not available' }, { status: 404 });
    }

    return NextResponse.json(chunk);
  } catch (error) {
    console.error('Mobile block chunk failed:', error);
    return NextResponse.json({ error: 'Block chunk failed' }, { status: 500 });
  } finally {
    await client.close();
  }
}
