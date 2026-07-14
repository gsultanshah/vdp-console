import { NextResponse } from 'next/server';
import { forbiddenResponse, getUserFromRequest, unauthorizedResponse } from '@/lib/auth';
import { canAccessHalka } from '@/lib/constituency-access';
import { connectNativeMongoClient } from '@/lib/mongo-client';
import { fetchParchiPreviewVoters } from '@/lib/voter-parchi/voter-data';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const user = getUserFromRequest(request);
  if (!user) {
    return unauthorizedResponse();
  }

  const { searchParams } = new URL(request.url);
  const halkaName = searchParams.get('halkaName') ?? '';
  const blockCode = searchParams.get('blockCode') ?? '';
  const limit = Math.max(1, Math.min(5, Number(searchParams.get('limit')) || 1));

  if (!halkaName || !blockCode) {
    return NextResponse.json({ error: 'halkaName and blockCode are required' }, { status: 400 });
  }

  if (!canAccessHalka(user, halkaName)) {
    return forbiddenResponse();
  }

  const client = await connectNativeMongoClient();
  try {
    const db = client.db('vdp');
    const voters = await fetchParchiPreviewVoters(db, halkaName, blockCode, limit);
    return NextResponse.json({ voters, blockCode, count: voters.length });
  } catch (error) {
    console.error('Preview voters fetch failed:', error);
    const message = error instanceof Error ? error.message : 'Failed to load preview voters';
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await client.close();
  }
}
