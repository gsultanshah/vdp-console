import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Voter from '@/models/Voter';

export async function DELETE(request: Request) {
  try {
    const { type, value } = await request.json();

    if (!type || !value) {
      return NextResponse.json(
        { error: 'Type and value are required' },
        { status: 400 }
      );
    }

    await connectDB();

    let query = {};
    if (type === 'blockCode') {
      query = { blockCode: value };
    } else if (type === 'halkaName') {
      query = { halkaName: value };
    } else {
      return NextResponse.json(
        { error: 'Invalid type. Must be either blockCode or halkaName' },
        { status: 400 }
      );
    }

    const result = await Voter.deleteMany(query);

    return NextResponse.json({
      message: `Successfully deleted ${result.deletedCount} voters`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Error deleting voters:', error);
    return NextResponse.json(
      { error: 'Failed to delete voters' },
      { status: 500 }
    );
  }
} 