import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import crypto from 'crypto';
import nodemailer from 'nodemailer';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    await connectDB();

    const user = await User.findOne({ email });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = Date.now() + 3600000; // 1 hour

    // Update user with reset token
    user.resetToken = resetToken;
    user.resetTokenExpiry = resetTokenExpiry;
    await user.save();

    // Create email transporter
    const transporter = nodemailer.createTransport({
      host: process.env.NEXT_PUBLIC_AWS_SES_SMTP_HOST,
      port: 587,
      secure: false,
      auth: {
        user: process.env.NEXT_PUBLIC_AWS_SES_SMTP_USER,
        pass: process.env.NEXT_PUBLIC_AWS_SES_SMTP_PASS,
      },
    });

    // Send reset email
    const resetUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/reset-password?token=${resetToken}`;
    await transporter.sendMail({
      to: email,
      subject: 'Password Reset Request',
      html: `
        <p>You requested a password reset</p>
        <p>Click this <a href="${resetUrl}">link</a> to set a new password.</p>
        <p>This link will expire in 1 hour.</p>
      `,
    });

    return NextResponse.json(
      { message: 'Password reset email sent' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Password reset error:', error);
    return NextResponse.json(
      { error: 'Error sending reset email' },
      { status: 500 }
    );
  }
} 