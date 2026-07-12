import { NextResponse } from 'next/server';
import { connectNativeMongoClient, getVdpDb } from '@/lib/mongo-client';
import { resolveMobileSession } from '@/lib/mobile/auth';
import { buildMobileSyncBundle } from '@/lib/mobile/sync';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const client = await connectNativeMongoClient();
  const db = getVdpDb(client);

  try {
    const session = await resolveMobileSession(request, db);
    if (!session || session.type !== 'user' || !session.halkaName) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const bundle = await buildMobileSyncBundle(db, {
      halkaName: session.halkaName,
      blockCode: null,
      accessCode: session.accessCode,
    });

    if (!bundle) {
      return NextResponse.json({ error: 'Constituency sync not available' }, { status: 404 });
    }

    return NextResponse.json(bundle);
  } catch (error) {
    console.error('Mobile constituency sync failed:', error);
    return NextResponse.json({ error: 'Constituency sync failed' }, { status: 500 });
  } finally {
    await client.close();
  }
}
