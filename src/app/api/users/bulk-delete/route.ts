import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import {
  forbiddenResponse,
  requireUserManager,
  unauthorizedResponse,
} from '@/lib/auth';
import { ACTIVE_USER_FILTER, isAdminRole } from '@/lib/user-management';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const manager = requireUserManager(request);
  if (!manager) {
    const user = request.headers.get('cookie')?.includes('user=');
    return user ? forbiddenResponse() : unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];

    if (!ids.length) {
      return NextResponse.json({ error: 'No users selected' }, { status: 400 });
    }

    await connectDB();

    const users = await User.find({ _id: { $in: ids }, ...ACTIVE_USER_FILTER });
    const blocked = users.filter(
      (user) => isAdminRole(user.role) || String(user._id) === manager._id
    );
    const deletable = users.filter(
      (user) => !isAdminRole(user.role) && String(user._id) !== manager._id
    );

    if (!deletable.length) {
      return NextResponse.json(
        {
          error: 'No deletable users in selection',
          blocked: blocked.map((user) => ({
            email: user.email,
            reason: isAdminRole(user.role)
              ? 'Admin users cannot be deleted'
              : 'Cannot delete your own account',
          })),
        },
        { status: 400 }
      );
    }

    const now = new Date();
    let deleted = 0;
    for (const user of deletable) {
      const originalEmail = String(user.email);
      user.deletedAt = now;
      user.deletedBy = manager.email;
      user.updatedAt = now;
      user.email = `deleted_${user._id}_${originalEmail}`;
      await user.save();
      deleted += 1;
    }

    return NextResponse.json({
      message: 'Users deleted',
      deleted,
      blocked: blocked.map((user) => ({
        email: user.email,
        reason: isAdminRole(user.role)
          ? 'Admin users cannot be deleted'
          : 'Cannot delete your own account',
      })),
    });
  } catch (error) {
    console.error('Bulk delete failed:', error);
    return NextResponse.json({ error: 'Failed to delete users' }, { status: 500 });
  }
}
