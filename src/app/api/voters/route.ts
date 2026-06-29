import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';
import { getInactiveHalkaNames } from '@/lib/constituency';
import { canAccessHalka, getAllowedHalkaName } from '@/lib/constituency-access';
import { resolveSessionUser } from '@/lib/session-user';

export const dynamic = 'force-dynamic';

function buildVoterQuery(input: {
  blockCode?: string | null;
  halkaName?: string | null;
  inactiveHalkaNames: string[];
  allowedHalka: string | null;
}): Record<string, unknown> | null {
  const query: Record<string, unknown> = {};

  if (input.blockCode) {
    query.blockCode = input.blockCode;
  }

  if (input.halkaName) {
    query.halkaName = input.halkaName;
  } else if (input.allowedHalka) {
    query.halkaName = input.allowedHalka;
  }

  if (input.inactiveHalkaNames.length > 0) {
    const existing = query.halkaName;
    if (typeof existing === 'string') {
      if (input.inactiveHalkaNames.includes(existing)) {
        return null;
      }
    } else {
      query.halkaName = { $nin: input.inactiveHalkaNames };
    }
  }

  if (!input.blockCode && !query.halkaName) {
    return null;
  }

  return query;
}

export async function POST(request: Request) {
  try {
    const voterData = await request.json();

    if (!voterData.cnic || !voterData.halkaName || !voterData.blockCode || voterData.row == null) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const voterRecord = {
      ...voterData,
      rowHeight: voterData.rowHeight ?? 40,
      rowY: voterData.rowY ?? 0,
    };

    const client = await MongoClient.connect(process.env.NEXT_PUBLIC_MONGODB_URI!);
    const db = client.db();

    try {
      const existingVoter = await db.collection('voters').findOne({
        cnic: voterData.cnic,
        halkaName: voterData.halkaName,
      });

      if (existingVoter) {
        return NextResponse.json({ message: 'Voter already exists' }, { status: 200 });
      }

      const result = await db.collection('voters').insertOne({
        ...voterRecord,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return NextResponse.json({
        message: 'Voter saved successfully',
        voterId: result.insertedId,
      });
    } finally {
      await client.close();
    }
  } catch (error) {
    console.error('Error saving voter:', error);
    return NextResponse.json({ error: 'Failed to save voter data' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const blockCode = searchParams.get('blockCode');
    const halkaName = searchParams.get('halkaName');
    const pageParam = searchParams.get('page');

    const sessionUser = await resolveSessionUser(request);
    const inactiveHalkaNames = await getInactiveHalkaNames();
    const allowedHalka = getAllowedHalkaName(sessionUser);

    if (halkaName && !canAccessHalka(sessionUser, halkaName)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const query = buildVoterQuery({
      blockCode,
      halkaName,
      inactiveHalkaNames,
      allowedHalka,
    });

    if (!query) {
      return NextResponse.json(
        { error: 'blockCode or halkaName is required' },
        { status: 400 }
      );
    }

    const client = await MongoClient.connect(process.env.NEXT_PUBLIC_MONGODB_URI!);
    const db = client.db();

    try {
      const sort = { blockCode: 1 as const, row: 1 as const, silsilaNo: 1 as const, _id: 1 as const };

      if (pageParam) {
        const page = Math.max(1, parseInt(pageParam, 10) || 1);
        const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50), 100);
        const skip = (page - 1) * limit;

        const [total, voters] = await Promise.all([
          db.collection('voters').countDocuments(query),
          db.collection('voters').find(query).sort(sort).skip(skip).limit(limit).toArray(),
        ]);

        return NextResponse.json({
          voters,
          currentPage: page,
          totalPages: Math.max(1, Math.ceil(total / limit)),
          total,
          pageSize: limit,
        });
      }

      const voters = await db.collection('voters').find(query).sort(sort).toArray();
      return NextResponse.json(voters);
    } finally {
      await client.close();
    }
  } catch (error) {
    console.error('Error fetching voters:', error);
    return NextResponse.json({ error: 'Failed to fetch voter data' }, { status: 500 });
  }
}
