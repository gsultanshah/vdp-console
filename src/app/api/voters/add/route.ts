import { NextResponse } from 'next/server';
import { connectNativeMongoClient, getVdpDb } from '@/lib/mongo-client';
import { assertHalkaIsActive, normalizeHalkaName } from '@/lib/constituency';
import { canAccessHalka } from '@/lib/constituency-access';
import { unauthorizedResponse } from '@/lib/auth';
import { resolveSessionUser } from '@/lib/session-user';
import { genderFromCnic, formatCnicStandard } from '@/lib/cnic';
import type { VoterTableCell } from '@/lib/voter-cells';

export const dynamic = 'force-dynamic';

const CNIC_REGEX = /^\d{5}-\d{7}-\d{1}$/;

interface VoterData {
  cnic: string;
  halkaName: string;
  blockCode: string;
  silsilaNo: string;
  gharanaNo?: string;
  name?: string;
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

function trimField(value: unknown): string {
  return String(value ?? '').trim();
}

function buildDisplayName(parts: {
  gharanaNo: string;
  fatherName?: string;
  profession?: string;
  age?: string;
  address?: string;
}): string {
  return [parts.gharanaNo, parts.fatherName, parts.profession, parts.age, parts.address]
    .map((value) => trimField(value))
    .filter(Boolean)
    .join(' ');
}

function buildManualVoterCells(parts: {
  silsilaNo: string;
  gharanaNo: string;
  fatherName?: string;
  profession?: string;
  age?: string;
  address?: string;
  cnic: string;
}): VoterTableCell[] {
  const entries: Array<{ id: string; label: string; text: string }> = [
    { id: 'silsila_no', label: 'Silsila', text: parts.silsilaNo },
    { id: 'name', label: 'Name', text: parts.gharanaNo },
    { id: 'father_name', label: 'Father', text: trimField(parts.fatherName) },
    { id: 'profession', label: 'Profession', text: trimField(parts.profession) },
    { id: 'age', label: 'Age', text: trimField(parts.age) },
    { id: 'address', label: 'Address', text: trimField(parts.address) },
    { id: 'cnic', label: 'CNIC', text: parts.cnic },
  ];

  return entries.filter((entry) => entry.text.length > 0);
}

export async function POST(request: Request) {
  const sessionUser = await resolveSessionUser(request);
  if (!sessionUser) {
    return unauthorizedResponse();
  }

  try {
    const voterData: VoterData = await request.json();

    const halkaName = normalizeHalkaName(trimField(voterData.halkaName));
    const blockCode = trimField(voterData.blockCode);
    const silsilaNo = trimField(voterData.silsilaNo);
    const cnic = formatCnicStandard(trimField(voterData.cnic));
    const listName = trimField(voterData.name);
    const gharanaNo = trimField(voterData.gharanaNo) || listName;

    const missingFields: string[] = [];
    if (!cnic) missingFields.push('cnic');
    if (!halkaName) missingFields.push('halkaName');
    if (!blockCode) missingFields.push('blockCode');
    if (!silsilaNo) missingFields.push('silsilaNo');
    if (!gharanaNo) missingFields.push('name');

    if (missingFields.length > 0) {
      return NextResponse.json(
        {
          error: 'Missing required fields',
          fields: missingFields,
        },
        { status: 400 }
      );
    }

    if (!canAccessHalka(sessionUser, halkaName)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const halkaCheck = await assertHalkaIsActive(halkaName);
    if (!halkaCheck.ok) {
      return NextResponse.json({ error: halkaCheck.error }, { status: 403 });
    }

    if (!CNIC_REGEX.test(cnic)) {
      return NextResponse.json(
        { error: 'Invalid CNIC format. Must be in format: XXXXX-XXXXXXX-X' },
        { status: 400 }
      );
    }

    const client = await connectNativeMongoClient();
    const db = getVdpDb(client);

    try {
      const flatFields = {
        cnic,
        halkaName,
        blockCode,
        silsilaNo,
        gharanaNo,
        fatherName: trimField(voterData.fatherName),
        profession: trimField(voterData.profession),
        age: trimField(voterData.age),
        address: trimField(voterData.address),
        religion: trimField(voterData.religion) || 'muslim',
        gender: trimField(voterData.gender) || genderFromCnic(cnic) || 'male',
      };

      const voterDocument = {
        ...flatFields,
        name: buildDisplayName(flatFields),
        cells: buildManualVoterCells(flatFields),
        row: typeof voterData.row === 'number' ? voterData.row : undefined,
        rowY: typeof voterData.rowY === 'number' ? voterData.rowY : undefined,
        rowHeight: typeof voterData.rowHeight === 'number' ? voterData.rowHeight : undefined,
        imageUrl: trimField(voterData.imageUrl) || undefined,
        updatedAt: new Date(),
      };

      const existingVoter = await db.collection('voters').findOne({
        cnic,
        halkaName,
      });

      if (existingVoter) {
        const sameBlock = trimField(existingVoter.blockCode) === blockCode;
        await db.collection('voters').updateOne(
          { _id: existingVoter._id },
          {
            $set: {
              ...voterDocument,
            },
          }
        );

        return NextResponse.json({
          message: sameBlock
            ? 'Voter updated in this block'
            : 'Voter assigned to this block',
          voterId: String(existingVoter._id),
          updated: true,
        });
      }

      const result = await db.collection('voters').insertOne({
        ...voterDocument,
        createdAt: new Date(),
      });

      return NextResponse.json({
        message: 'Voter added successfully',
        voterId: String(result.insertedId),
        updated: false,
      });
    } finally {
      await client.close();
    }
  } catch (error) {
    console.error('Error adding voter:', error);
    return NextResponse.json({ error: 'Failed to add voter' }, { status: 500 });
  }
}
