import { NextResponse } from 'next/server';
import { PARCHI_FIELD_DEFINITIONS } from '@/lib/voter-parchi/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ fields: PARCHI_FIELD_DEFINITIONS });
}
