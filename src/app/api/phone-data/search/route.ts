import { NextResponse } from 'next/server';
import {
  formatCnicDisplay,
  formatPhoneDisplay,
  isPhoneDataConfigured,
  normalizeCnicDigits,
  normalizePhoneDigits,
  searchPhoneData,
} from '@/lib/phone-data';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cnic = searchParams.get('cnic');
  const phone = searchParams.get('phone');

  if (!cnic && !phone) {
    return NextResponse.json({ error: 'Provide cnic and/or phone' }, { status: 400 });
  }

  if (!isPhoneDataConfigured()) {
    return NextResponse.json(
      {
        error: 'Phone data search is not configured',
        details: 'Set AWS_REGION and PHONE_DATA_TABLE in .env',
        configured: false,
      },
      { status: 503 }
    );
  }

  try {
    const results = await searchPhoneData({ cnic, phone });

    return NextResponse.json({
      configured: true,
      count: results.length,
      query: {
        cnic: cnic ? normalizeCnicDigits(cnic) : null,
        cnicDisplay: cnic ? formatCnicDisplay(normalizeCnicDigits(cnic)) : null,
        phone: phone ? normalizePhoneDigits(phone) : null,
        phoneDisplay: phone ? formatPhoneDisplay(phone) : null,
      },
      results: results.map((record) => ({
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
      })),
    });
  } catch (error) {
    console.error('Phone data search failed:', error);
    return NextResponse.json(
      {
        error: 'Failed to search phone data',
        details: error instanceof Error ? error.message : 'Unknown error',
        configured: true,
      },
      { status: 500 }
    );
  }
}
