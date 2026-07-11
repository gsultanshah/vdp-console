import { NextResponse } from 'next/server';
import { connectNativeMongoClient, getVdpDb } from '@/lib/mongo-client';
import { canAccessHalka } from '@/lib/constituency-access';
import { unauthorizedResponse } from '@/lib/auth';
import { resolveSessionUser } from '@/lib/session-user';
import {
  DEFAULT_SPREADSHEET_SORT,
  isSpreadsheetSortField,
  parseSortDirection,
  type SpreadsheetSortField,
} from '@/lib/voter-batch';
import { findVoterSpreadsheetPosition } from '@/lib/voter-spreadsheet-position';
import type { GenderFilter } from '@/lib/cnic';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const sessionUser = await resolveSessionUser(request);
  if (!sessionUser) {
    return unauthorizedResponse();
  }

  try {
    const { searchParams } = new URL(request.url);
    const voterId = searchParams.get('voterId')?.trim();
    const blockCode = searchParams.get('blockCode')?.trim();
    const halkaName = searchParams.get('halkaName')?.trim();
    const genderParam = searchParams.get('gender');
    const genderFilter: GenderFilter =
      genderParam === 'male' || genderParam === 'female' ? genderParam : 'both';
    const sortByParam = searchParams.get('sortBy');
    const sortBy: SpreadsheetSortField = isSpreadsheetSortField(sortByParam)
      ? sortByParam
      : DEFAULT_SPREADSHEET_SORT.sortBy;
    const sortDir = parseSortDirection(searchParams.get('sortOrder'));
    const pageSize = Math.min(Math.max(1, parseInt(searchParams.get('pageSize') || '100', 10) || 100), 200);

    if (!voterId || !blockCode || !halkaName) {
      return NextResponse.json(
        { error: 'voterId, blockCode, and halkaName are required' },
        { status: 400 }
      );
    }

    if (!canAccessHalka(sessionUser, halkaName)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const client = await connectNativeMongoClient();
    const db = getVdpDb(client);

    try {
      const position = await findVoterSpreadsheetPosition(db, {
        voterId,
        blockCode,
        halkaName,
        genderFilter,
        sortBy,
        sortDir,
        pageSize,
      });

      if (!position) {
        return NextResponse.json({ error: 'Voter not found in current filter/sort' }, { status: 404 });
      }

      return NextResponse.json(position);
    } finally {
      await client.close();
    }
  } catch (error) {
    console.error('Failed to resolve spreadsheet position:', error);
    return NextResponse.json({ error: 'Failed to resolve spreadsheet position' }, { status: 500 });
  }
}
