import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';

export async function POST(request: Request) {
  try {
    // Connect to MongoDB
    const client = await MongoClient.connect(process.env.NEXT_PUBLIC_MONGODB_URI!);
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