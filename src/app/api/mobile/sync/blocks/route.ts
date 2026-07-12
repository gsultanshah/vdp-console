import { NextResponse } from 'next/server';
import { connectNativeMongoClient, getVdpDb } from '@/lib/mongo-client';
import { resolveMobileSession } from '@/lib/mobile/auth';
import { listMobileBlockCodes } from '@/lib/mobile/sync';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const client = await connectNativeMongoClient();
  const db = getVdpDb(client);

  try {
    const session = await resolveMobileSession(request, db);
    if (!session || session.type !== 'user' || !session.halkaName) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const blocks = await listMobileBlockCodes(db, session.halkaName);
    return NextResponse.json({ blocks, halkaName: session.halkaName });
  } catch (error) {
    console.error('Mobile block list failed:', error);
    return NextResponse.json({ error: 'Failed to load block codes' }, { status: 500 });
  } finally {
    await client.close();
  }
}
