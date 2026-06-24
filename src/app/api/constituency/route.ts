import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Constituency from '@/models/Constituency';
import {
  activeConstituencyExists,
  normalizeHalkaName,
} from '@/lib/constituency';

export async function POST(req: Request) {
  try {
    await connectDB();
    const body = await req.json();
    const rawName = body.halkaName ?? body.name ?? '';
    const halkaName = normalizeHalkaName(String(rawName));

    if (!halkaName) {
      return NextResponse.json({ error: 'Halka name is required' }, { status: 400 });
    }

    if (await activeConstituencyExists(halkaName)) {
      return NextResponse.json(
        { error: 'An active constituency with this name already exists' },
        { status: 409 }
      );
    }

    const { name: _name, halkaName: _halka, ...rest } = body;
    const constituency = await Constituency.create({ ...rest, halkaName });
    return NextResponse.json(constituency, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create constituency' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get('activeOnly') === 'true';

    const filter: Record<string, unknown> = { deletedAt: null };
    if (activeOnly) {
      filter.status = 'active';
    }

    const constituencies = await Constituency.find(filter).sort({ halkaName: 1 });
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
    const { _id, estimates, updateFromEstimate, ...updateData } = body;

    if (!_id) {
      return NextResponse.json(
        { error: 'Constituency ID is required' },
        { status: 400 }
      );
    }

    const existing = await Constituency.findById(_id);
    if (!existing || existing.deletedAt) {
      return NextResponse.json({ error: 'Constituency not found' }, { status: 404 });
    }

    const isStatusUpdate = body.status === 'active' || body.status === 'inactive';

    if (existing.status === 'inactive' && !isStatusUpdate) {
      return NextResponse.json(
        { error: 'This constituency is inactive. Reactivate it to make changes.' },
        { status: 403 }
      );
    }

    // If updating from an estimate
    if (updateFromEstimate) {
      const constituency = await Constituency.findById(_id);
      if (!constituency) {
        return NextResponse.json(
          { error: 'Constituency not found' },
          { status: 404 }
        );
      }

      // Find the estimate
      const estimate = constituency.estimates.find((e: { _id: { toString: () => string } }) => e._id.toString() === updateFromEstimate);
      if (!estimate) {
        return NextResponse.json(
          { error: 'Estimate not found' },
          { status: 404 }
        );
      }

      // Update main counts from the estimate
      constituency.muslimFemale = estimate.muslimFemale;
      constituency.muslimMale = estimate.muslimMale;
      constituency.qadianiFemale = estimate.qadianiFemale;
      constituency.qadianiMale = estimate.qadianiMale;
      constituency.totalVoters = estimate.totalVoters;
      constituency.lastUpdated = new Date();
      constituency.updatedAt = new Date();

      await constituency.save();
      return NextResponse.json(constituency);
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

    if (!id) {
      return NextResponse.json({ error: 'Constituency ID is required' }, { status: 400 });
    }

    const constituency = await Constituency.findByIdAndUpdate(
      id,
      { deletedAt: new Date(), updatedAt: new Date() },
      { new: true }
    );

    if (!constituency) {
      return NextResponse.json({ error: 'Constituency not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Constituency deleted successfully' });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete constituency' }, { status: 500 });
  }
} 