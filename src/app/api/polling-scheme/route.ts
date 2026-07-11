import { NextResponse } from 'next/server';
import { connectNativeMongoClient } from '@/lib/mongo-client';
import { canAccessHalka } from '@/lib/constituency-access';
import { findPollingSchemeDoc, normalizePollingSchemeHalka } from '@/lib/polling-scheme/blockcode-lookup';
import { resolveSessionUser } from '@/lib/session-user';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const halkaName = searchParams.get('halkaName');
  const blockcode = searchParams.get('blockcode');
  const type = searchParams.get('type');

  if (!halkaName || !blockcode || !type) {
    return NextResponse.json(
      { error: 'halkaName, blockcode, and type are required' },
      { status: 400 }
    );
  }

  try {
    const sessionUser = await resolveSessionUser(request);
    if (!canAccessHalka(sessionUser, halkaName)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const client = await connectNativeMongoClient();
    const db = client.db('vdp');

    const pollingInfo = await findPollingSchemeDoc(db, {
      halkaName: normalizePollingSchemeHalka(halkaName),
      blockCode: blockcode,
      type: type as 'male' | 'female' | 'combined',
    });
    
    await client.close();
    
    if (!pollingInfo) {
      return NextResponse.json(
        { error: 'Polling information not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(pollingInfo);
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch polling information' },
      { status: 500 }
    );
  }
} 