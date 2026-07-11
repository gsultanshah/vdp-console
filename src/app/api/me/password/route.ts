import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { unauthorizedResponse } from '@/lib/auth';
import { resolveSessionUser } from '@/lib/session-user';

export const dynamic = 'force-dynamic';

export async function PUT(request: Request) {
  const sessionUser = await resolveSessionUser(request);
  if (!sessionUser?._id) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const currentPassword = String(body.currentPassword ?? '');
    const newPassword = String(body.newPassword ?? '');
    const confirmPassword = String(body.confirmPassword ?? '');

    if (!currentPassword || !newPassword || !confirmPassword) {
      return NextResponse.json({ error: 'All password fields are required' }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: 'New password must be at least 6 characters' }, { status: 400 });
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json({ error: 'New passwords do not match' }, { status: 400 });
    }

    if (currentPassword === newPassword) {
      return NextResponse.json({ error: 'New password must be different from current password' }, { status: 400 });
    }

    await connectDB();
    const user = await User.findById(sessionUser._id);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.password !== currentPassword) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });
    }

    user.password = newPassword;
    user.updatedAt = new Date();
    await user.save();

    return NextResponse.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Password update error:', error);
    return NextResponse.json({ error: 'Failed to update password' }, { status: 500 });
  }
}
