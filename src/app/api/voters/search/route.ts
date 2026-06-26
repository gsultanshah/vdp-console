import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';
import { getInactiveHalkaNames } from '@/lib/constituency';
import { canAccessHalka, getAllowedHalkaName } from '@/lib/constituency-access';
import { resolveSessionUser } from '@/lib/session-user';

export const dynamic = 'force-dynamic';

const uri = process.env.NEXT_PUBLIC_MONGODB_URI as string;
if (!uri) {
  throw new Error('Please add your Mongo URI to .env.local');
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cnic = searchParams.get('cnic');

  if (!cnic) {
    return NextResponse.json({ error: 'CNIC is required' }, { status: 400 });
  }

  try {
    const sessionUser = await resolveSessionUser(request);
    const inactiveHalkaNames = await getInactiveHalkaNames();
    const client = await MongoClient.connect(uri);
    const db = client.db('vdp');
    const query: Record<string, unknown> = { cnic };
    if (inactiveHalkaNames.length > 0) {
      query.halkaName = { $nin: inactiveHalkaNames };
    }

    const allowedHalka = getAllowedHalkaName(sessionUser);
    if (allowedHalka) {
      query.halkaName = allowedHalka;
    }

    const voters = await db.collection('voters').find(query).toArray();

    const filteredVoters = sessionUser
      ? voters.filter((voter) => canAccessHalka(sessionUser, String(voter.halkaName ?? '')))
      : voters;
    
    await client.close();
    
    return NextResponse.json(filteredVoters);
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { error: 'Failed to search voters' },
      { status: 500 }
    );
  }
} 