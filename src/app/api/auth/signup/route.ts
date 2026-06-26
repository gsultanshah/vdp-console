import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { ALL_CONSTITUENCIES } from '@/lib/user-management';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    await connectDB();

    const body = await request.json();
    const { name, email, password } = body;

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: 'Please provide all required fields' },
        { status: 400 }
      );
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return NextResponse.json(
        { error: 'User already exists with this email' },
        { status: 400 }
      );
    }

    const user = await User.create({
      name,
      email,
      password,
      role: 'user',
      constituencyAccess: ALL_CONSTITUENCIES,
      updatedAt: new Date(),
    });

    await User.updateOne(
      { _id: user._id },
      { $set: { constituencyAccess: ALL_CONSTITUENCIES } }
    );

    const userResponse = {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      constituencyAccess: ALL_CONSTITUENCIES,
      createdAt: user.createdAt,
    };

    return NextResponse.json(
      { message: 'User created successfully', user: userResponse },
      { status: 201 }
    );
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'Failed to create user' },
      { status: 500 }
    );
  }
}
