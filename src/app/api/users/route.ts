import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import Constituency from '@/models/Constituency';
import {
  forbiddenResponse,
  requireUserManager,
  unauthorizedResponse,
} from '@/lib/auth';
import {
  formatUser,
  isAdminRole,
  resolveConstituencyAccessForSave,
} from '@/lib/user-management';

export const dynamic = 'force-dynamic';

async function getValidHalkaNames(): Promise<string[]> {
  await connectDB();
  const constituencies = await Constituency.find({
    deletedAt: null,
    status: 'active',
  })
    .select('halkaName')
    .lean();

  return constituencies.map((item) => String(item.halkaName));
}

export async function GET(request: Request) {
  const manager = requireUserManager(request);
  if (!manager) {
    const user = request.headers.get('cookie')?.includes('user=');
    return user ? forbiddenResponse() : unauthorizedResponse();
  }

  try {
    await connectDB();
    const users = await User.find({}).sort({ createdAt: -1 }).lean();
    return NextResponse.json(users.map((user) => formatUser(user)));
  } catch (error) {
    console.error('Error listing users:', error);
    return NextResponse.json({ error: 'Failed to list users' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const manager = requireUserManager(request);
  if (!manager) {
    const user = request.headers.get('cookie')?.includes('user=');
    return user ? forbiddenResponse() : unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const { name, email, password, role, constituencyAccess } = body;

    if (!name?.trim() || !email?.trim() || !password?.trim()) {
      return NextResponse.json(
        { error: 'Name, email, and password are required' },
        { status: 400 }
      );
    }

    const normalizedRole = role?.trim() || 'user';
    if (!['user', 'admin'].includes(normalizedRole)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    await connectDB();
    const validHalkaNames = await getValidHalkaNames();
    const resolvedConstituencyAccess = resolveConstituencyAccessForSave(
      normalizedRole,
      constituencyAccess,
      validHalkaNames
    );

    if (!resolvedConstituencyAccess) {
      return NextResponse.json({ error: 'Invalid constituency selection' }, { status: 400 });
    }

    const existingUser = await User.findOne({ email: email.trim().toLowerCase() });
    if (existingUser) {
      return NextResponse.json({ error: 'User already exists with this email' }, { status: 400 });
    }

    const user = await User.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      role: normalizedRole,
      constituencyAccess: resolvedConstituencyAccess,
      updatedAt: new Date(),
    });

    await User.updateOne(
      { _id: user._id },
      { $set: { constituencyAccess: resolvedConstituencyAccess } }
    );
    user.constituencyAccess = resolvedConstituencyAccess;

    return NextResponse.json(
      { message: 'User created successfully', user: formatUser(user) },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }
}
