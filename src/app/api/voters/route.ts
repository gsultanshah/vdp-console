import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';

export async function POST(request: Request) {
  try {
    const voterData = await request.json();

    // Validate required fields for OCR pipeline saves
    if (!voterData.cnic || !voterData.halkaName || !voterData.blockCode || voterData.row == null) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const voterRecord = {
      ...voterData,
      rowHeight: voterData.rowHeight ?? 40,
      rowY: voterData.rowY ?? 0,
    };

    // Connect to MongoDB
    const client = await MongoClient.connect(process.env.NEXT_PUBLIC_MONGODB_URI!);
    const db = client.db();

    // Check if voter already exists
    const existingVoter = await db.collection('voters').findOne({
      cnic: voterData.cnic,
      blockCode: voterData.blockCode
    });

    if (existingVoter) {
      await client.close();
      return NextResponse.json(
        { message: 'Voter already exists' },
        { status: 200 }
      );
    }

    const voterWithTimestamp = {
      ...voterRecord,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Insert voter data
    const result = await db.collection('voters').insertOne(voterWithTimestamp);

    await client.close();

    return NextResponse.json({
      message: 'Voter saved successfully',
      voterId: result.insertedId
    });

  } catch (error) {
    console.error('Error saving voter:', error);
    return NextResponse.json(
      { error: 'Failed to save voter data' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const blockCode = searchParams.get('blockCode');
    const halkaName = searchParams.get('halkaName');

    // Connect to MongoDB
    const client = await MongoClient.connect(process.env.NEXT_PUBLIC_MONGODB_URI!);
    const db = client.db();

    // Build query
    const query: any = {};
    if (blockCode) query.blockCode = blockCode;
    if (halkaName) query.halkaName = halkaName;

    // Get voters
    const voters = await db.collection('voters')
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    await client.close();

    return NextResponse.json(voters);

  } catch (error) {
    console.error('Error fetching voters:', error);
    return NextResponse.json(
      { error: 'Failed to fetch voter data' },
      { status: 500 }
    );
  }
} 