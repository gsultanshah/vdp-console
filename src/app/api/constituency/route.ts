import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Constituency from '@/models/Constituency';

export async function POST(req: Request) {
  try {
    await connectDB();
    const body = await req.json();
    const constituency = await Constituency.create(body);
    return NextResponse.json(constituency, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create constituency' }, { status: 500 });
  }
}

export async function GET() {
  try {
    await connectDB();
    const constituencies = await Constituency.find().sort({ halkaName: 1 });
    return NextResponse.json(constituencies);
  } catch (error) {
    console.error('Error fetching constituencies:', error);
    return NextResponse.json(
      { error: 'Failed to fetch constituencies' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    await connectDB();
    const body = await request.json();
    const { _id, estimates, ...updateData } = body;

    if (!_id) {
      return NextResponse.json(
        { error: 'Constituency ID is required' },
        { status: 400 }
      );
    }

    // If estimates are provided, add them to the estimates array
    if (estimates && Array.isArray(estimates)) {
      const constituency = await Constituency.findById(_id);
      if (!constituency) {
        return NextResponse.json(
          { error: 'Constituency not found' },
          { status: 404 }
        );
      }

      // Add new estimates to the array
      constituency.estimates = [...(constituency.estimates || []), ...estimates];
      await constituency.save();

      return NextResponse.json(constituency);
    }

    // If no estimates, update other fields
    const updatedConstituency = await Constituency.findByIdAndUpdate(
      _id,
      {
        ...updateData,
        lastUpdated: new Date(),
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!updatedConstituency) {
      return NextResponse.json(
        { error: 'Constituency not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(updatedConstituency);
  } catch (error) {
    console.error('Error updating constituency:', error);
    return NextResponse.json(
      { error: 'Failed to update constituency' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    await Constituency.findByIdAndDelete(id);
    return NextResponse.json({ message: 'Constituency deleted successfully' });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete constituency' }, { status: 500 });
  }
} 