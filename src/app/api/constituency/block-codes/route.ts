import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Constituency from '@/models/Constituency';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '100');
    const skip = (page - 1) * limit;

    // Get total count of block codes
    const totalBlockCodes = await Constituency.aggregate([
      { $unwind: '$blockCodes' },
      { $count: 'total' }
    ]);

    const total = totalBlockCodes[0]?.total || 0;
    const totalPages = Math.ceil(total / limit);

    // Get paginated block codes with constituency details
    const blockCodes = await Constituency.aggregate([
      { $unwind: '$blockCodes' },
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          _id: 1,
          code: '$blockCodes',
          constituency: {
            name: '$name',
            label: '$label'
          }
        }
      }
    ]);

    return NextResponse.json({
      blockCodes,
      currentPage: page,
      totalPages,
      total
    });
  } catch (error) {
    console.error('Error fetching block codes:', error);
    return NextResponse.json(
      { error: 'Failed to fetch block codes' },
      { status: 500 }
    );
  }
} 