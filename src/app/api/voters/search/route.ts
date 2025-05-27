import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';

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
    const client = await MongoClient.connect(uri);
    const db = client.db('vdp');
    const voters = await db
      .collection('voters')
      .find({ cnic: cnic })
      .toArray();
    
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