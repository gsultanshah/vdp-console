import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Constituency from '@/models/Constituency';
import { requireAdmin } from '@/lib/auth';
import { connectNativeMongoClient, getVdpDb } from '@/lib/mongo-client';
import { resolveMobileSession } from '@/lib/mobile/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const cookieAdmin = requireAdmin(request);

  const client = await connectNativeMongoClient();
  const db = getVdpDb(client);

  try {
    if (!cookieAdmin) {
      const session = await resolveMobileSession(request, db);
      if (!session || session.type !== 'admin') {
        return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
      }
    }

    await connectDB();
    const constituencies = await Constituency.find({ deletedAt: null, status: 'active' })
      .sort({ halkaName: 1 })
      .lean();

    return NextResponse.json({
      constituencies: constituencies.map((item) => ({
        halkaName: item.halkaName,
        label: item.label ?? item.halkaName,
      })),
    });
  } catch (error) {
    console.error('Mobile constituencies failed:', error);
    return NextResponse.json({ error: 'Failed to load constituencies' }, { status: 500 });
  } finally {
    await client.close();
  }
}
