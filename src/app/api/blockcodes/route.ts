import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import BlockCode from '@/models/BlockCode';

// Mark this route as dynamic
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const blockCode = searchParams.get('blockCode');

    if (!blockCode) {
      return NextResponse.json(
        { error: 'Block code is required' },
        { status: 400 }
      );
    }

    const blockCodes = await BlockCode.find({ blockCode }).sort({ uploadedAt: -1 });

    return NextResponse.json(blockCodes);
  } catch (error) {
    console.error('Error fetching block codes:', error);
    return NextResponse.json(
      { error: 'Failed to fetch block codes' },
      { status: 500 }
    );
  }
} 