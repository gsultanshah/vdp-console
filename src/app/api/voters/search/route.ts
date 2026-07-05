import { NextResponse } from 'next/server';
import { connectNativeMongoClient } from '@/lib/mongo-client';
import { getInactiveHalkaNames } from '@/lib/constituency';
import { canAccessHalka, getAllowedHalkaName } from '@/lib/constituency-access';
import { resolveSessionUser } from '@/lib/session-user';
import { buildFlexibleCnicRegex } from '@/lib/cnic';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cnic = searchParams.get('cnic');

  if (!cnic) {
    return NextResponse.json({ error: 'CNIC is required' }, { status: 400 });
  }

  try {
    const sessionUser = await resolveSessionUser(request);
    const inactiveHalkaNames = await getInactiveHalkaNames();
    const client = await connectNativeMongoClient();
    const db = client.db('vdp');
    const cnicPattern = buildFlexibleCnicRegex(cnic);
    const query: Record<string, unknown> = cnicPattern
      ? { cnic: { $regex: cnicPattern, $options: 'i' } }
      : { cnic };
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