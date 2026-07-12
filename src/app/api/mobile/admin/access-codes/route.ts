import { NextResponse } from 'next/server';
import { connectNativeMongoClient, getVdpDb } from '@/lib/mongo-client';
import { requireUserManager } from '@/lib/auth';
import { createAccessCode, listAccessCodes, updateAccessCode } from '@/lib/mobile/access-codes';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const manager = requireUserManager(request);
  if (!manager) {
    return NextResponse.json({ error: 'User management access required' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const halkaName = searchParams.get('halkaName') ?? undefined;

  const client = await connectNativeMongoClient();
  try {
    const db = getVdpDb(client);
    const codes = await listAccessCodes(db, halkaName);
    return NextResponse.json({ codes });
  } catch (error) {
    console.error('List mobile access codes failed:', error);
    return NextResponse.json({ error: 'Failed to load access codes' }, { status: 500 });
  } finally {
    await client.close();
  }
}

export async function POST(request: Request) {
  const manager = requireUserManager(request);
  if (!manager) {
    return NextResponse.json({ error: 'User management access required' }, { status: 403 });
  }

  try {
    const body = (await request.json()) as {
      halkaName?: string;
      label?: string;
      branding?: Record<string, unknown>;
      code?: string;
    };

    if (!body.halkaName) {
      return NextResponse.json({ error: 'halkaName is required' }, { status: 400 });
    }

    const client = await connectNativeMongoClient();
    const db = getVdpDb(client);
    try {
      const code = await createAccessCode(db, {
        halkaName: body.halkaName,
        label: body.label ?? '',
        branding: body.branding as never,
        createdBy: manager.email,
        createdByName: manager.name,
        code: body.code,
      });
      return NextResponse.json({ code });
    } finally {
      await client.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create access code';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const manager = requireUserManager(request);
  if (!manager) {
    return NextResponse.json({ error: 'User management access required' }, { status: 403 });
  }

  try {
    const body = (await request.json()) as {
      id?: string;
      label?: string;
      active?: boolean;
      branding?: Record<string, unknown>;
    };

    if (!body.id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const client = await connectNativeMongoClient();
    const db = getVdpDb(client);
    try {
      const code = await updateAccessCode(db, body.id, {
        label: body.label,
        active: body.active,
        branding: body.branding as never,
      });
      if (!code) {
        return NextResponse.json({ error: 'Access code not found' }, { status: 404 });
      }
      return NextResponse.json({ code });
    } finally {
      await client.close();
    }
  } catch (error) {
    console.error('Update mobile access code failed:', error);
    return NextResponse.json({ error: 'Failed to update access code' }, { status: 500 });
  }
}
