import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Constituency from '@/models/Constituency';
import { getRestoredHalkaName } from '@/lib/constituency';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await connectDB();
    const constituencies = await Constituency.find({ deletedAt: { $ne: null } })
      .sort({ deletedAt: -1 });

    return NextResponse.json(constituencies);
  } catch (error) {
    console.error('Error fetching deleted constituencies:', error);
    return NextResponse.json(
      { error: 'Failed to fetch deleted constituencies' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await connectDB();
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'Constituency ID is required' }, { status: 400 });
    }

    const toRestore = await Constituency.findOne({ _id: id, deletedAt: { $ne: null } });
    if (!toRestore) {
      return NextResponse.json(
        { error: 'Deleted constituency not found' },
        { status: 404 }
      );
    }

    const originalName = toRestore.halkaName;
    const { halkaName, renamed } = await getRestoredHalkaName(originalName);

    toRestore.halkaName = halkaName;
    toRestore.deletedAt = null;
    toRestore.updatedAt = new Date();
    toRestore.lastUpdated = new Date();
    await toRestore.save();

    return NextResponse.json({
      constituency: toRestore,
      renamed,
      originalName: renamed ? originalName : undefined,
    });
  } catch (error) {
    console.error('Error restoring constituency:', error);
    return NextResponse.json(
      { error: 'Failed to restore constituency' },
      { status: 500 }
    );
  }
}
