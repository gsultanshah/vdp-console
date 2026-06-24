import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';
import { getInactiveHalkaNames } from '@/lib/constituency';

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
    const inactiveHalkaNames = await getInactiveHalkaNames();
    const client = await MongoClient.connect(uri);
    const db = client.db('vdp');
    const query: Record<string, unknown> = { cnic };
    if (inactiveHalkaNames.length > 0) {
      query.halkaName = { $nin: inactiveHalkaNames };
    }
    const voters = await db.collection('voters').find(query).toArray();
    
    await client.close();
    
    return NextResponse.json(voters);
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { error: 'Failed to search voters' },
      { status: 500 }
    );
  }
} 