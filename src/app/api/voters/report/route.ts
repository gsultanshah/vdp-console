import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import mongoose from 'mongoose';

export async function GET() {
  try {
    await connectDB();
    const db = mongoose.connection.db;
    
    if (!db) {
      throw new Error('Database connection not established');
    }

    const collection = db.collection('voters');

    // Get total count
    const total = await collection.countDocuments();

    // Get field counts
    const fields = [
      'cnic',
      'halkaName',
      'blockCode',
      'silsilaNo',
      'gharanaNo',
      'name',
      'row',
      'rowY',
      'rowHeight',
      'imageUrl'
    ];

    const fieldCounts: { [key: string]: number } = {};
    
    for (const field of fields) {
      const count = await collection.countDocuments({ [field]: { $exists: true } });
      fieldCounts[field] = count;
    }

    return NextResponse.json({
      total,
      fieldCounts
    });
  } catch (error) {
    console.error('Error generating data report:', error);
    return NextResponse.json(
      { error: 'Failed to generate data report' },
      { status: 500 }
    );
  }
} 