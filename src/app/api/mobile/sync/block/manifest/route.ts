import { NextResponse } from 'next/server';
import { connectNativeMongoClient, getVdpDb } from '@/lib/mongo-client';
import { resolveMobileSession } from '@/lib/mobile/auth';
import { buildMobileBlockSyncManifest } from '@/lib/mobile/sync';

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
    if (!blockCode) {
      return NextResponse.json({ error: 'blockCode is required' }, { status: 400 });
    }

    const manifest = await buildMobileBlockSyncManifest(db, {
      halkaName: session.halkaName,
      blockCode,
      accessCode: session.accessCode,
    });

    if (!manifest) {
      return NextResponse.json({ error: 'Block sync not available' }, { status: 404 });
    }

    return NextResponse.json(manifest);
  } catch (error) {
    console.error('Mobile block manifest failed:', error);
    return NextResponse.json({ error: 'Block manifest failed' }, { status: 500 });
  } finally {
    await client.close();
  }
}
