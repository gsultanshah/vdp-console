import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { ALL_CONSTITUENCIES } from '@/lib/user-management';

export const dynamic = 'force-dynamic';

function buildSessionUser(user: {
  _id: unknown;
  name: string;
  email: string;
  role?: string;
  constituencyAccess?: string;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  return {
    _id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role ?? 'user',
    constituencyAccess: user.constituencyAccess ?? ALL_CONSTITUENCIES,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Please provide email and password' },
        { status: 400 }
      );
    }

    await connectDB();

    const user = await User.findOne({ email });

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    const isPasswordValid = password === user.password;
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    if (!user.constituencyAccess) {
      user.constituencyAccess = ALL_CONSTITUENCIES;
      user.updatedAt = new Date();
      await user.save();
    }

    const { password: _, ...userWithoutPassword } = user.toObject();
    const sessionUser = buildSessionUser(userWithoutPassword);

    return NextResponse.json(
      {
        message: 'Signed in successfully',
        user: sessionUser,
      },
      {
        status: 200,
        headers: {
          'Set-Cookie': `user=${encodeURIComponent(JSON.stringify(sessionUser))}; Path=/; HttpOnly; SameSite=Strict`,
        },
      }
    );
  } catch (error) {
    console.error('Signin error:', error);
    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500 }
    );
  }
}
