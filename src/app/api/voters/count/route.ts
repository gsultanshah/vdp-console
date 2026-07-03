import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import { getInactiveHalkaNames } from '@/lib/constituency';
import { canAccessHalka, getAllowedHalkaName } from '@/lib/constituency-access';
import { resolveSessionUser } from '@/lib/session-user';
import { getBlockVoterStats, getHalkaVoterStats } from '@/lib/voter-block-stats';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const blockCode = searchParams.get('blockCode')?.trim();
    const halkaName = searchParams.get('halkaName')?.trim();

    if (!halkaName) {
      return NextResponse.json({ error: 'halkaName is required' }, { status: 400 });
    }

    if (!blockCode) {
      const sessionUser = await resolveSessionUser(request);
      if (!canAccessHalka(sessionUser, halkaName)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const allowedHalka = getAllowedHalkaName(sessionUser);
      if (allowedHalka && allowedHalka !== halkaName) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const inactiveHalkaNames = await getInactiveHalkaNames();
      if (inactiveHalkaNames.includes(halkaName)) {
        return NextResponse.json({ count: 0, male: 0, female: 0, halkaName });
      }

      const mongooseConn = mongoose.connection;
      if (!mongooseConn.db) {
        throw new Error('Database connection not established');
      }

      const stats = await getHalkaVoterStats(mongooseConn.db, halkaName);
      return NextResponse.json({ ...stats, halkaName });
    }

    const sessionUser = await resolveSessionUser(request);
    if (!canAccessHalka(sessionUser, halkaName)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const allowedHalka = getAllowedHalkaName(sessionUser);
    if (allowedHalka && allowedHalka !== halkaName) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const inactiveHalkaNames = await getInactiveHalkaNames();
    if (inactiveHalkaNames.includes(halkaName)) {
      return NextResponse.json({ count: 0, male: 0, female: 0, blockCode, halkaName });
    }

    const mongooseConn = mongoose.connection;
    if (!mongooseConn.db) {
      throw new Error('Database connection not established');
    }

    const stats = await getBlockVoterStats(mongooseConn.db, blockCode, halkaName);

    return NextResponse.json({ ...stats, blockCode, halkaName });
  } catch (error) {
    console.error('Error counting voters:', error);
    return NextResponse.json({ error: 'Failed to count voters' }, { status: 500 });
  }
}
