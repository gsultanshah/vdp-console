import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { unauthorizedResponse } from '@/lib/auth';
import { buildProfilePermissions } from '@/lib/profile-permissions';
import { resolveSessionUser } from '@/lib/session-user';
import {
  buildSessionCookieHeader,
  toPublicUserProfile,
  toSessionUser,
} from '@/lib/session-cookie';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const sessionUser = await resolveSessionUser(request);
  if (!sessionUser?._id) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    const user = await User.findById(sessionUser._id).lean();
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const profile = toPublicUserProfile(user);
    const permissions = buildProfilePermissions(toSessionUser(profile));

    let adminStats: { totalUsers: number; adminUsers: number } | null = null;
    if (permissions.isAdmin) {
      const [totalUsers, adminUsers] = await Promise.all([
        User.countDocuments(),
        User.countDocuments({ role: 'admin' }),
      ]);
      adminStats = { totalUsers, adminUsers };
    }

    return NextResponse.json({
      user: profile,
      permissions,
      adminStats,
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const sessionUser = await resolveSessionUser(request);
  if (!sessionUser?._id) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
    }

    await connectDB();
    const user = await User.findById(sessionUser._id);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (email !== user.email) {
      const duplicate = await User.findOne({
        email,
        _id: { $ne: user._id },
      });
      if (duplicate) {
        return NextResponse.json({ error: 'Email is already in use' }, { status: 400 });
      }
      user.email = email;
    }

    user.name = name;
    user.updatedAt = new Date();
    await user.save();

    const profile = toPublicUserProfile(user);
    const session = toSessionUser(profile);

    return NextResponse.json(
      {
        message: 'Profile updated successfully',
        user: profile,
        permissions: buildProfilePermissions(session),
      },
      {
        headers: {
          'Set-Cookie': buildSessionCookieHeader(session),
        },
      }
    );
  } catch (error) {
    console.error('Profile update error:', error);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
