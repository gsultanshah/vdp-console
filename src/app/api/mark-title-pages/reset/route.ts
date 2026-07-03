import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { connectNativeMongoClient } from '@/lib/mongo-client';
import { resetStuckTitleLocks } from '@/lib/mark-title-pages';

export const dynamic = 'force-dynamic';

/** Reset block codes stuck in title-tagging status=processing */
export async function POST() {
  try {
    await connectDB();
    const client = await connectNativeMongoClient();
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
