import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';
import { getInactiveHalkaNames } from '@/lib/constituency';
import { canAccessHalka, getAllowedHalkaName } from '@/lib/constituency-access';
import { resolveSessionUser } from '@/lib/session-user';

export const dynamic = 'force-dynamic';

const uri = process.env.NEXT_PUBLIC_MONGODB_URI as string;

/**
 * Batch check which CNICs exist in the voters collection.
 * GET /api/voters/lookup?cnics=37404-2611137-4,61101-4321279-5
 */
export async function GET(request: Request) {
  const cnicsParam = new URL(request.url).searchParams.get('cnics');
  if (!cnicsParam?.trim()) {
    return NextResponse.json({ error: 'cnics query param is required' }, { status: 400 });
  }

  const cnics = cnicsParam
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);

  if (cnics.length === 0) {
    return NextResponse.json({ found: [] as string[] });
  }

  if (cnics.length > 100) {
    return NextResponse.json({ error: 'Maximum 100 CNICs per request' }, { status: 400 });
  }

  try {
    const sessionUser = await resolveSessionUser(request);
    const inactiveHalkaNames = await getInactiveHalkaNames();
    const client = await MongoClient.connect(uri);
    const db = client.db('vdp');

    const query: Record<string, unknown> = { cnic: { $in: cnics } };

    const halkaName = new URL(request.url).searchParams.get('halkaName')?.trim();
    if (halkaName) {
      query.halkaName = halkaName.replace(/\s+/g, '').toUpperCase();
    } else if (inactiveHalkaNames.length > 0) {
      query.halkaName = { $nin: inactiveHalkaNames };
    }

    const allowedHalka = getAllowedHalkaName(sessionUser);
    if (allowedHalka) {
      query.halkaName = allowedHalka;
    }

    const voters = await db
      .collection('voters')
      .find(query, { projection: { cnic: 1, halkaName: 1 } })
      .toArray();

    await client.close();

    const found = voters
      .filter((voter) => canAccessHalka(sessionUser, String(voter.halkaName ?? '')))
      .map((voter) => String(voter.cnic));

    return NextResponse.json({ found: Array.from(new Set(found)) });
  } catch (error) {
    console.error('Voter lookup failed:', error);
    return NextResponse.json({ error: 'Failed to lookup voters' }, { status: 500 });
  }
}
