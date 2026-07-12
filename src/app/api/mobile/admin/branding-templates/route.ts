import { NextResponse } from 'next/server';
import { connectNativeMongoClient, getVdpDb } from '@/lib/mongo-client';
import { requireAdmin } from '@/lib/auth';
import {
  createBrandingTemplate,
  listBrandingTemplates,
  updateBrandingTemplate,
} from '@/lib/mobile/branding';

export const dynamic = 'force-dynamic';

export async function GET() {
  const client = await connectNativeMongoClient();
  try {
    const db = getVdpDb(client);
    const templates = await listBrandingTemplates(db);
    return NextResponse.json({ templates });
  } catch (error) {
    console.error('List branding templates failed:', error);
    return NextResponse.json({ error: 'Failed to load templates' }, { status: 500 });
  } finally {
    await client.close();
  }
}

export async function POST(request: Request) {
  const admin = requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const body = (await request.json()) as {
      name?: string;
      description?: string;
      logoUrl?: string | null;
      colors?: Record<string, string>;
      isDefault?: boolean;
    };

    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const client = await connectNativeMongoClient();
    const db = getVdpDb(client);
    try {
      const template = await createBrandingTemplate(db, {
        name: body.name,
        description: body.description,
        logoUrl: body.logoUrl,
        colors: body.colors,
        isDefault: body.isDefault,
      });
      return NextResponse.json({ template });
    } finally {
      await client.close();
    }
  } catch (error) {
    console.error('Create branding template failed:', error);
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const admin = requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const body = (await request.json()) as {
      id?: string;
      name?: string;
      description?: string;
      logoUrl?: string | null;
      colors?: Record<string, string>;
      isDefault?: boolean;
    };

    if (!body.id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const client = await connectNativeMongoClient();
    const db = getVdpDb(client);
    try {
      const template = await updateBrandingTemplate(db, body.id, body);
      if (!template) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 });
      }
      return NextResponse.json({ template });
    } finally {
      await client.close();
    }
  } catch (error) {
    console.error('Update branding template failed:', error);
    return NextResponse.json({ error: 'Failed to update template' }, { status: 500 });
  }
}
