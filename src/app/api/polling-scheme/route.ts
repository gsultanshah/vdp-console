import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';
import { canAccessHalka } from '@/lib/constituency-access';
import { resolveSessionUser } from '@/lib/session-user';

export const dynamic = 'force-dynamic';

const uri = process.env.NEXT_PUBLIC_MONGODB_URI as string;
if (!uri) {
  throw new Error('Please add your Mongo URI to .env.local');
}

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

    const client = await MongoClient.connect(uri);
    const db = client.db('vdp');
    
    const pollingInfo = await db
      .collection('polling_scheme')
      .findOne({
        halkaName,
        blockcode: parseInt(blockcode),
        type
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