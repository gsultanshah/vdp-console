import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Voter from '@/models/Voter';

export async function POST(request: Request) {
  try {
    await connectDB();
    const voterData = await request.json();

    // Validate required fields
    // const requiredFields = ['cnic', 'halkaName', 'blockCode', 'silsilaNo', 'gharanaNo', 'name', 'row', 'rowY', 'rowHeight', 'imageUrl'];
    // const missingFields = requiredFields.filter(field => !voterData[field]);
    
    // if (missingFields.length > 0) {
    //   return NextResponse.json(
    //     { error: `Missing required fields: ${missingFields.join(', ')}` },
    //     { status: 400 }
    //   );
    // }

    // Check if voter already exists
    const existingVoter = await Voter.findOne({
      cnic: voterData.cnic,
      blockCode: voterData.blockCode
    });

    if (existingVoter) {
      return NextResponse.json(
        { message: 'Voter already exists' },
        { status: 200 }
      );
    }

    // Create new voter
    const voter = await Voter.create(voterData);

    return NextResponse.json({
      message: 'Voter saved successfully',
      voter
    }, { status: 201 });

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
    await connectDB();
    const { searchParams } = new URL(request.url);
    const blockCode = searchParams.get('blockCode');
    const halkaName = searchParams.get('halkaName');

    // Build query
    const query: any = {};
    if (blockCode) query.blockCode = blockCode;
    if (halkaName) query.halkaName = halkaName;

    // Get voters
    const voters = await Voter.find(query)
      .sort({ createdAt: -1 })
      .limit(1000);

    return NextResponse.json(voters);

  } catch (error) {
    console.error('Error fetching voters:', error);
    return NextResponse.json(
      { error: 'Failed to fetch voter data' },
      { status: 500 }
    );
  }
} 