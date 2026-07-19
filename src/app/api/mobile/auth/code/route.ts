import { NextResponse } from 'next/server';
import { connectNativeMongoClient, getVdpDb } from '@/lib/mongo-client';
import { createUserSessionFromCode } from '@/lib/mobile/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { code?: string };
    const code = body.code?.trim() ?? '';
    if (!/^\d{6}$/.test(code.replace(/\D/g, '').padStart(6, '0').slice(-6))) {
      return NextResponse.json({ error: 'Enter a valid 6-digit access code.' }, { status: 400 });
    }

    const client = await connectNativeMongoClient();
    const db = getVdpDb(client);
    try {
      const normalized = code.replace(/\D/g, '').padStart(6, '0').slice(-6);
      const result = await createUserSessionFromCode(db, normalized);
      if (!result) {
        return NextResponse.json({ error: 'Invalid or inactive access code.' }, { status: 401 });
      }

      return NextResponse.json({
        token: result.session.token,
        expiresAt: result.session.expiresAt,
        halkaName: result.halkaName,
        label: result.label,
        accessCode: normalized,
        branding: result.branding,
        selectAllBlockCodes: result.selectAllBlockCodes,
        blockCodes: result.blockCodes,
      });
    } finally {
      await client.close();
    }
  } catch (error) {
    console.error('Mobile code auth failed:', error);
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
  }
}
