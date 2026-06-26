import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';

interface VoterData {
  cnic: string;
  halkaName: string;
  blockCode: string;
  silsilaNo: string;
  gharanaNo: string;
  name: string;
  row?: number;
  rowY?: number;
  rowHeight?: number;
  imageUrl?: string;
}

export async function POST(request: Request) {
  try {
    const voterData: VoterData = await request.json();

    // Validate required fields
    const requiredFields = ['cnic', 'halkaName', 'blockCode', 'silsilaNo', 'gharanaNo', 'name'];
    const missingFields = requiredFields.filter(field => !voterData[field as keyof VoterData]);

    if (missingFields.length > 0) {
      return NextResponse.json(
        { 
          error: 'Missing required fields',
          fields: missingFields
        },
        { status: 400 }
      );
    }

    // Validate CNIC format (should be in format: XXXXX-XXXXXXX-X)
    const cnicRegex = /^\d{5}-\d{7}-\d{1}$/;
    if (!cnicRegex.test(voterData.cnic)) {
      return NextResponse.json(
        { error: 'Invalid CNIC format. Must be in format: XXXXX-XXXXXXX-X' },
        { status: 400 }
      );
    }

    // Connect to MongoDB
    const client = await MongoClient.connect(process.env.NEXT_PUBLIC_MONGODB_URI!);
    const db = client.db();

    try {
      // Check if voter already exists
      const existingVoter = await db.collection('voters').findOne({
        cnic: voterData.cnic,
        halkaName: voterData.halkaName,
      });

      if (existingVoter) {
        return NextResponse.json(
          { 
            message: 'Voter already exists',
            voterId: existingVoter._id
          },
          { status: 200 }
        );
      }

      // Prepare voter data
      const voterWithTimestamp = {
        ...voterData,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Insert voter data
      const result = await db.collection('voters').insertOne(voterWithTimestamp);

      return NextResponse.json({
        message: 'Voter added successfully',
        voterId: result.insertedId
      });

    } finally {
      await client.close();
    }

  } catch (error) {
    console.error('Error adding voter:', error);
    return NextResponse.json(
      { error: 'Failed to add voter' },
      { status: 500 }
    );
  }
} 