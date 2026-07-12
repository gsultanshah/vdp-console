import { NextResponse } from 'next/server';
import { connectNativeMongoClient, getVdpDb } from '@/lib/mongo-client';
import { resolveMobileSession } from '@/lib/mobile/auth';
import { searchMobileVotersOnline } from '@/lib/mobile/sync';

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
    const q = searchParams.get('q')?.trim() ?? '';
    const blockCode = searchParams.get('blockCode') ?? undefined;
    const limit = Number.parseInt(searchParams.get('limit') ?? '25', 10);

    if (!q) {
      return NextResponse.json({ voters: [] });
    }

    const voters = await searchMobileVotersOnline(db, {
      halkaName: session.halkaName,
      q,
      blockCode,
      limit,
    });

    return NextResponse.json({ voters });
  } catch (error) {
    console.error('Mobile search failed:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  } finally {
    await client.close();
  }
}
