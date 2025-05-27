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
    const constituencies = await Constituency.find({}).sort({ createdAt: -1 });
    return NextResponse.json(constituencies);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch constituencies' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    await connectDB();
    const body = await req.json();
    const { id, ...updateData } = body;
    const constituency = await Constituency.findByIdAndUpdate(id, updateData, { new: true });
    return NextResponse.json(constituency);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update constituency' }, { status: 500 });
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