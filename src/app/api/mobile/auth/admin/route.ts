import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { requireAdmin, type SessionUser } from '@/lib/auth';
import { connectNativeMongoClient, getVdpDb } from '@/lib/mongo-client';
import { createAdminSession } from '@/lib/mobile/auth';

export const dynamic = 'force-dynamic';

function buildSessionUser(user: {
  _id: unknown;
  name: string;
  email: string;
  role?: string;
}): SessionUser {
  return {
    _id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role ?? 'user',
  };
}

export async function POST(request: Request) {
  try {
    let admin = requireAdmin(request);

    if (!admin) {
      const body = (await request.json()) as { email?: string; password?: string };
      if (!body.email || !body.password) {
        return NextResponse.json({ error: 'Admin credentials required' }, { status: 401 });
      }

      await connectDB();
      const user = await User.findOne({ email: body.email.trim().toLowerCase() });
      if (!user || body.password !== user.password || user.role !== 'admin') {
        return NextResponse.json({ error: 'Invalid admin credentials' }, { status: 401 });
      }
      admin = buildSessionUser(user);
    }

    const client = await connectNativeMongoClient();
    const db = getVdpDb(client);
    try {
      const session = await createAdminSession(db, admin);
      return NextResponse.json({
        token: session.token,
        expiresAt: session.expiresAt,
        user: {
          _id: admin._id,
          name: admin.name,
          email: admin.email,
          role: admin.role,
        },
      });
    } finally {
      await client.close();
    }
  } catch (error) {
    console.error('Mobile admin auth failed:', error);
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
  }
}
