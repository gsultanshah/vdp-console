import { NextResponse } from 'next/server';
import {
  forbiddenResponse,
  requireAdmin,
  unauthorizedResponse,
} from '@/lib/auth';
import {
  formatCnicDisplay,
  formatPhoneDisplay,
  isPhoneDataConfigured,
  putPhoneDataRecord,
  type PutPhoneDataInput,
} from '@/lib/phone-data';

export const dynamic = 'force-dynamic';

function formatRecord(record: Awaited<ReturnType<typeof putPhoneDataRecord>>) {
  return {
    cnic: record.cnic,
    cnicDisplay: formatCnicDisplay(record.cnic),
    phone: record.phone,
    phoneDisplay: formatPhoneDisplay(record.phone),
    firstname: record.firstname,
    gender: record.gender,
    address1: record.address1,
    address2: record.address2,
    address3: record.address3,
    sourceFile: record.sourceFile,
    data: record.data,
  };
}

async function savePhoneRecord(request: Request) {
  if (!isPhoneDataConfigured()) {
    return NextResponse.json(
      {
        error: 'Phone data is not configured',
        details: 'Phone data service is not configured',
        configured: false,
      },
      { status: 503 }
    );
  }

  const admin = requireAdmin(request);
  if (!admin) {
    const hasSession = request.headers.get('cookie')?.includes('user=');
    return hasSession ? forbiddenResponse() : unauthorizedResponse();
  }

  let body: PutPhoneDataInput;

  try {
    body = (await request.json()) as PutPhoneDataInput;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.cnic?.trim() || !body.phone?.trim()) {
    return NextResponse.json(
      { error: 'CNIC and phone are required', fields: ['cnic', 'phone'] },
      { status: 400 }
    );
  }

  try {
    const record = await putPhoneDataRecord(body);

    return NextResponse.json({
      message: 'Phone record saved',
      configured: true,
      record: formatRecord(record),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save phone record';
    const status = message.includes('must be') ? 400 : 500;

    console.error('Phone data save failed:', error);
    return NextResponse.json(
      {
        error: status === 400 ? message : 'Failed to save phone record',
        details: message,
        configured: true,
      },
      { status }
    );
  }
}

export async function POST(request: Request) {
  return savePhoneRecord(request);
}

export async function PUT(request: Request) {
  return savePhoneRecord(request);
}
