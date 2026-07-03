import { NextResponse } from 'next/server';
import { connectNativeMongoClient } from '@/lib/mongo-client';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    // Connect to MongoDB
    const client = await connectNativeMongoClient();
    const db = client.db('vdp');

    // Update all documents with status "processing" to "uploaded"
    const result = await db.collection('blockcodes').updateMany(
      { status: 'processing' },
      { $set: { status: 'uploaded' } }
    );

    await client.close();

    return NextResponse.json({
      message: 'Successfully reset processing status',
      modifiedCount: result.modifiedCount
    });
  } catch (error: any) {
    console.error('Error resetting processing status:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to reset processing status' },
      { status: 500 }
    );
  }
} 