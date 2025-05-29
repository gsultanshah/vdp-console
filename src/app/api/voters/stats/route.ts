import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { Document } from 'mongodb';

interface Voter {
  cnic: string;
  halkaName: string;
  blockCode: string;
  silsilaNo: string;
  gharanaNo: string;
  name: string;
  row?: number;
  rowY?: number;
  rowHeight?: number;
  imageUrl?: string;
}

interface FieldCounts {
  cnic: number;
  halkaName: number;
  blockCode: number;
  silsilaNo: number;
  gharanaNo: number;
  name: number;
  row: number;
  rowY: number;
  rowHeight: number;
  imageUrl: number;
  [key: string]: number;
}

export async function GET() {
  try {
    const mongoose = await connectDB();
    if (!mongoose.connection.db) {
      throw new Error('Database connection not established');
    }

    const voters = await mongoose.connection.db.collection('voters').find({}).toArray();
    const typedVoters = voters.map(doc => ({
      cnic: doc.cnic as string,
      halkaName: doc.halkaName as string,
      blockCode: doc.blockCode as string,
      silsilaNo: doc.silsilaNo as string,
      gharanaNo: doc.gharanaNo as string,
      name: doc.name as string,
      row: doc.row as number | undefined,
      rowY: doc.rowY as number | undefined,
      rowHeight: doc.rowHeight as number | undefined,
      imageUrl: doc.imageUrl as string | undefined
    }));

    const total = typedVoters.length;
    const fields: FieldCounts = {
      cnic: 0,
      halkaName: 0,
      blockCode: 0,
      silsilaNo: 0,
      gharanaNo: 0,
      name: 0,
      row: 0,
      rowY: 0,
      rowHeight: 0,
      imageUrl: 0
    };

    // Count non-null values for each field
    typedVoters.forEach(voter => {
      Object.keys(fields).forEach(field => {
        if (voter[field as keyof Voter] !== null && voter[field as keyof Voter] !== undefined && voter[field as keyof Voter] !== '') {
          fields[field]++;
        }
      });
    });

    return NextResponse.json({
      total,
      fields
    });
  } catch (error) {
    console.error('Error fetching voter statistics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch voter statistics' },
      { status: 500 }
    );
  }
} 