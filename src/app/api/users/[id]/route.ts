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

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const manager = requireUserManager(request);
  if (!manager) {
    const user = request.headers.get('cookie')?.includes('user=');
    return user ? forbiddenResponse() : unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const { name, email, password, role, constituencyAccess } = body;

    await connectDB();

    const user = await User.findById(params.id);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (name?.trim()) {
      user.name = name.trim();
    }

    if (email?.trim()) {
      const normalizedEmail = email.trim().toLowerCase();
      const duplicate = await User.findOne({
        email: normalizedEmail,
        _id: { $ne: user._id },
      });
      if (duplicate) {
        return NextResponse.json({ error: 'Email is already in use' }, { status: 400 });
      }
      user.email = normalizedEmail;
    }

    if (password?.trim()) {
      user.password = password;
    }

    const nextRole = role?.trim() || user.role;
    if (role?.trim()) {
      if (!['user', 'admin'].includes(nextRole)) {
        return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
      }
      user.role = nextRole;
    }

    const validHalkaNames = await getValidHalkaNames();
    const resolvedConstituencyAccess = resolveConstituencyAccessForSave(
      user.role,
      constituencyAccess ?? user.constituencyAccess,
      validHalkaNames
    );

    if (!resolvedConstituencyAccess) {
      return NextResponse.json({ error: 'Invalid constituency selection' }, { status: 400 });
    }

    user.constituencyAccess = resolvedConstituencyAccess;
    user.updatedAt = new Date();
    await user.save();

    return NextResponse.json({
      message: 'User updated successfully',
      user: formatUser(user),
    });
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const manager = requireUserManager(request);
  if (!manager) {
    const user = request.headers.get('cookie')?.includes('user=');
    return user ? forbiddenResponse() : unauthorizedResponse();
  }

  if (manager._id === params.id) {
    return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 });
  }

  try {
    await connectDB();

    const user = await User.findById(params.id);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Admin users cannot be deleted' }, { status: 403 });
    }

    await User.findByIdAndDelete(params.id);

    return NextResponse.json({ message: 'User permanently deleted' });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}
