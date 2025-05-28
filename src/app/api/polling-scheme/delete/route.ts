import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';

export async function DELETE(request: Request) {
  try {
    const { type, value } = await request.json();

    if (!type || !value) {
      return NextResponse.json(
        { error: 'Type and value are required' },
        { status: 400 }
      );
    }

    const client = await MongoClient.connect(process.env.NEXT_PUBLIC_MONGODB_URI!);
    const db = client.db();

    let query: any = {};
    
    // Convert value to appropriate type based on the field
    switch (type) {
      case 'sn':
        query.sn = parseInt(value);
        break;
      case 'blockcode':
        query.blockcode = parseInt(value);
        break;
      case 'halkaName':
        query.halkaName = value;
        break;
      default:
        await client.close();
        return NextResponse.json(
          { error: 'Invalid delete type' },
          { status: 400 }
        );
    }

    const result = await db.collection('polling_scheme').deleteMany(query);
    await client.close();

    return NextResponse.json({
      message: 'Records deleted successfully',
      deletedCount: result.deletedCount
    });
  } catch (error: any) {
    console.error('Error deleting polling scheme records:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete records' },
      { status: 500 }
    );
  }
} 