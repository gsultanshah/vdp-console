import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { MongoClient } from 'mongodb';
import { resetStuckTitleLocks } from '@/lib/mark-title-pages';

export const dynamic = 'force-dynamic';

/** Reset block codes stuck in title-tagging status=processing */
export async function POST() {
  try {
    await connectDB();
    const client = new MongoClient(process.env.NEXT_PUBLIC_MONGODB_URI as string);
    await client.connect();
    const db = client.db('vdp');
    const modifiedCount = await resetStuckTitleLocks(db);
    await client.close();

    return NextResponse.json({
      message: 'Reset stuck title-tagging locks',
      modifiedCount,
    });
  } catch (error) {
    console.error('Failed to reset title locks:', error);
    return NextResponse.json(
      { error: 'Failed to reset title locks' },
      { status: 500 }
    );
  }
}
