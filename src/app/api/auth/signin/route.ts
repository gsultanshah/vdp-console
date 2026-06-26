import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      console.log('Missing credentials:', { email: !!email, password: !!password });
      return NextResponse.json(
        { error: 'Please provide email and password' },
        { status: 400 }
      );
    }

    console.log('Attempting to connect to database...');
    await connectDB();
    console.log('Database connected successfully');

    // Find user by email
    console.log('Looking for user with email:', email);
    const user = await User.findOne({ email });
    
    if (!user) {
      console.log('No user found with email:', email);
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    console.log('User found, comparing passwords...');
    // Compare password
    const isPasswordValid = password === user.password;
    //const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      console.log('Invalid password for user:', email);
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    console.log('Password valid, generating response...');
    // Remove password from response
    const { password: _, ...userWithoutPassword } = user.toObject();

    return NextResponse.json(
      { 
        message: 'Signed in successfully', 
        user: userWithoutPassword 
      },
      { 
        status: 200,
        headers: {
          'Set-Cookie': `user=${JSON.stringify(userWithoutPassword)}; Path=/; HttpOnly; SameSite=Strict`
        }
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