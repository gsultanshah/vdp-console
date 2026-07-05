import { NextResponse } from 'next/server';
import { connectNativeMongoClient } from '@/lib/mongo-client';
import { assertHalkaIsActive } from '@/lib/constituency';
import { canAccessHalka } from '@/lib/constituency-access';
import { unauthorizedResponse } from '@/lib/auth';
import { resolveSessionUser } from '@/lib/session-user';

export const dynamic = 'force-dynamic';

interface VoterData {
  cnic: string;
  halkaName: string;
  blockCode: string;
  silsilaNo: string;
  gharanaNo: string;
  name: string;
  fatherName?: string;
  profession?: string;
  age?: string;
  address?: string;
  religion?: string;
  gender?: string;
  row?: number;
  rowY?: number;
  rowHeight?: number;
  imageUrl?: string;
}

export async function POST(request: Request) {
  const sessionUser = await resolveSessionUser(request);
  if (!sessionUser) {
    return unauthorizedResponse();
  }

  try {
    const voterData: VoterData = await request.json();

    const requiredFields = ['cnic', 'halkaName', 'blockCode', 'silsilaNo', 'gharanaNo', 'name'];
    const missingFields = requiredFields.filter((field) => !voterData[field as keyof VoterData]);

    if (missingFields.length > 0) {
      return NextResponse.json(
        {
          error: 'Missing required fields',
          fields: missingFields,
        },
        { status: 400 }
      );
    }

    if (!canAccessHalka(sessionUser, voterData.halkaName)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const halkaCheck = await assertHalkaIsActive(voterData.halkaName);
    if (!halkaCheck.ok) {
      return NextResponse.json({ error: halkaCheck.error }, { status: 403 });
    }

    const cnicRegex = /^\d{5}-\d{7}-\d{1}$/;
    if (!cnicRegex.test(voterData.cnic.trim())) {
      return NextResponse.json(
        { error: 'Invalid CNIC format. Must be in format: XXXXX-XXXXXXX-X' },
        { status: 400 }
      );
    }

    const client = await connectNativeMongoClient();
    const db = client.db('vdp');

    try {
      const existingVoter = await db.collection('voters').findOne({
        cnic: voterData.cnic.trim(),
        halkaName: voterData.halkaName,
      });

      if (existingVoter) {
        return NextResponse.json(
          {
            message: 'Voter already exists',
            voterId: existingVoter._id,
          },
          { status: 200 }
        );
      }

      const voterWithTimestamp = {
        ...voterData,
        cnic: voterData.cnic.trim(),
        silsilaNo: voterData.silsilaNo.trim(),
        blockCode: voterData.blockCode.trim(),
        gharanaNo: voterData.gharanaNo.trim(),
        name: voterData.name.trim(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await db.collection('voters').insertOne(voterWithTimestamp);

      return NextResponse.json({
        message: 'Voter added successfully',
        voterId: result.insertedId,
      });
    } finally {
      await client.close();
    }
  } catch (error) {
    console.error('Error adding voter:', error);
    return NextResponse.json({ error: 'Failed to add voter' }, { status: 500 });
  }
}
