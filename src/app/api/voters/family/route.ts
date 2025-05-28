import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const blockCode = searchParams.get('blockCode');
    const gharanaNo = searchParams.get('gharanaNo');

    if (!blockCode || !gharanaNo) {
      return NextResponse.json(
        { error: 'Block code and gharana number are required' },
        { status: 400 }
      );
    }

    const mongoose = await connectDB();
    if (!mongoose.connection.db) {
      throw new Error('Database connection not established');
    }

    const voters = await mongoose.connection.db
      .collection('voters')
      .find({
        blockCode,
        gharanaNo,
      })
      .toArray();

    return NextResponse.json(voters);
  } catch (error) {
    console.error('Error searching family members:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 