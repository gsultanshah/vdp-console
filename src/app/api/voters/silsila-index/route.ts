import { NextResponse } from 'next/server';
import { connectNativeMongoClient } from '@/lib/mongo-client';
import { canAccessHalka } from '@/lib/constituency-access';
import { unauthorizedResponse } from '@/lib/auth';
import { resolveSessionUser } from '@/lib/session-user';
import type { SilsilaIndexEntry } from '@/lib/spreadsheet-silsila-validation';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const sessionUser = await resolveSessionUser(request);
    if (!sessionUser) {
      return unauthorizedResponse();
    }

    const { searchParams } = new URL(request.url);
    const blockCode = searchParams.get('blockCode')?.trim();
    const halkaName = searchParams.get('halkaName')?.trim();

    if (!blockCode || !halkaName) {
      return NextResponse.json({ error: 'blockCode and halkaName are required' }, { status: 400 });
    }

    if (!canAccessHalka(sessionUser, halkaName)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const client = await connectNativeMongoClient();
    const db = client.db('vdp');

    try {
      const voters = await db
        .collection('voters')
        .find({ blockCode, halkaName })
        .project({
          _id: 1,
          silsilaNo: 1,
          row: 1,
          fileName: 1,
          imageUrl: 1,
          cnic: 1,
        })
        .toArray();

      const entries: SilsilaIndexEntry[] = voters.map((voter) => ({
        id: String(voter._id),
        silsilaNo: String(voter.silsilaNo ?? ''),
        row: typeof voter.row === 'number' ? voter.row : undefined,
        pageKey: String(voter.imageUrl ?? voter.fileName ?? ''),
        cnic: voter.cnic != null ? String(voter.cnic) : undefined,
      }));

      return NextResponse.json({ entries, total: entries.length });
    } finally {
      await client.close();
    }
  } catch (error) {
    console.error('Failed to load silsila index:', error);
    return NextResponse.json({ error: 'Failed to load silsila index' }, { status: 500 });
  }
}
