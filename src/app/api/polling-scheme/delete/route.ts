import { NextResponse } from 'next/server';
import { connectNativeMongoClient } from '@/lib/mongo-client';
import { ObjectId } from 'mongodb';

export const dynamic = 'force-dynamic';

export async function DELETE(request: Request) {
  try {
    const { type, value } = await request.json();

    if (!type || !value) {
      return NextResponse.json({ error: 'Type and value are required' }, { status: 400 });
    }

    const client = await connectNativeMongoClient();
    const db = client.db('vdp');

    let query: Record<string, unknown> = {};

    switch (type) {
      case 'sn':
        query.sn = String(value);
        break;
      case 'blockcode': {
        const numeric = Number.parseInt(String(value).replace(/[^\d]/g, ''), 10);
        query.blockcode = Number.isFinite(numeric) ? numeric : String(value);
        break;
      }
      case 'halkaName':
        query.halkaName = String(value).replace(/\s+/g, '').toUpperCase();
        break;
      case 'importId':
        if (!ObjectId.isValid(String(value))) {
          await client.close();
          return NextResponse.json({ error: 'Invalid importId' }, { status: 400 });
        }
        query.importId = new ObjectId(String(value));
        break;
      case 'rowId':
        if (!ObjectId.isValid(String(value))) {
          await client.close();
          return NextResponse.json({ error: 'Invalid rowId' }, { status: 400 });
        }
        query._id = new ObjectId(String(value));
        break;
      default:
        await client.close();
        return NextResponse.json({ error: 'Invalid delete type' }, { status: 400 });
    }

    const [schemeResult] = await Promise.all([
      db.collection('polling_scheme').deleteMany(query),
      type === 'importId'
        ? db.collection('polling_scheme_imports').deleteOne({ _id: query.importId as ObjectId })
        : Promise.resolve(null),
      type === 'halkaName'
        ? db.collection('polling_scheme_imports').deleteMany({ halkaName: query.halkaName })
        : Promise.resolve(null),
    ]);

    await client.close();

    return NextResponse.json({
      message: 'Records deleted successfully',
      deletedCount: schemeResult.deletedCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete records';
    console.error('Error deleting polling scheme records:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
