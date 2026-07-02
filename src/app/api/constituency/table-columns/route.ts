import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Constituency from '@/models/Constituency';
import { canAccessHalka } from '@/lib/constituency-access';
import { resolveSessionUser } from '@/lib/session-user';
import {
  normalizeColumnDefinitions,
  validateColumnDefinitions,
  type ConstituencyTableColumnSettings,
} from '@/lib/table-column-settings';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const sessionUser = await resolveSessionUser(request);
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const halkaName = searchParams.get('halkaName');
    const constituencyId = searchParams.get('constituencyId');

    if (!halkaName && !constituencyId) {
      return NextResponse.json(
        { error: 'halkaName or constituencyId is required' },
        { status: 400 }
      );
    }

    if (halkaName && !canAccessHalka(sessionUser, halkaName)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await connectDB();

    const constituency = constituencyId
      ? await Constituency.findOne({ _id: constituencyId, deletedAt: null })
      : await Constituency.findOne({ halkaName, deletedAt: null });

    if (!constituency) {
      return NextResponse.json({ error: 'Constituency not found' }, { status: 404 });
    }

    const tableColumnSettings =
      (constituency.tableColumnSettings as ConstituencyTableColumnSettings | null) ?? null;

    return NextResponse.json({
      constituencyId: constituency._id.toString(),
      halkaName: constituency.halkaName,
      blockCodes: constituency.blockCodes ?? [],
      tableColumnSettings,
    });
  } catch (error) {
    console.error('Error fetching table column settings:', error);
    return NextResponse.json({ error: 'Failed to fetch table column settings' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const sessionUser = await resolveSessionUser(request);
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const constituencyId = body.constituencyId ? String(body.constituencyId) : '';
    const columns = Array.isArray(body.columns) ? body.columns : null;
    const sourcePageId = body.sourcePageId ? String(body.sourcePageId) : undefined;
    const sourceBlockCode = body.sourceBlockCode ? String(body.sourceBlockCode).trim() : undefined;

    if (!constituencyId) {
      return NextResponse.json({ error: 'constituencyId is required' }, { status: 400 });
    }
    if (!columns) {
      return NextResponse.json({ error: 'columns array is required' }, { status: 400 });
    }

    const normalized = normalizeColumnDefinitions(columns);
    const validationError = validateColumnDefinitions(normalized);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    await connectDB();

    const constituency = await Constituency.findOne({ _id: constituencyId, deletedAt: null });
    if (!constituency) {
      return NextResponse.json({ error: 'Constituency not found' }, { status: 404 });
    }

    if (!canAccessHalka(sessionUser, constituency.halkaName)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (constituency.status === 'inactive') {
      return NextResponse.json(
        { error: 'This constituency is inactive. Reactivate it to make changes.' },
        { status: 403 }
      );
    }

    if (
      sourceBlockCode &&
      !(constituency.blockCodes ?? []).includes(sourceBlockCode)
    ) {
      return NextResponse.json(
        { error: `Block code ${sourceBlockCode} is not in this constituency` },
        { status: 400 }
      );
    }

    const tableColumnSettings: ConstituencyTableColumnSettings = {
      columns: normalized,
      sourcePageId,
      updatedAt: new Date().toISOString(),
    };

    constituency.tableColumnSettings = tableColumnSettings;
    constituency.updatedAt = new Date();
    constituency.lastUpdated = new Date();
    await constituency.save();

    return NextResponse.json({
      constituencyId: constituency._id.toString(),
      halkaName: constituency.halkaName,
      tableColumnSettings,
    });
  } catch (error) {
    console.error('Error saving table column settings:', error);
    return NextResponse.json({ error: 'Failed to save table column settings' }, { status: 500 });
  }
}
