import { NextResponse } from 'next/server';
import { connectNativeMongoClient, getVdpDb } from '@/lib/mongo-client';
import { resolveMobileSession } from '@/lib/mobile/auth';
import { getAccessCodeByCode } from '@/lib/mobile/access-codes';
import { resolveBrandingForAccessCode } from '@/lib/mobile/branding';
import { resolveParchiDesignForMobile } from '@/lib/mobile/parchi-design';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const client = await connectNativeMongoClient();
  const db = getVdpDb(client);

  try {
    const session = await resolveMobileSession(request, db);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.type === 'admin') {
      return NextResponse.json({
        type: 'admin',
        userName: session.userName,
        userEmail: session.userEmail,
      });
    }

    const accessCode = session.accessCode
      ? await getAccessCodeByCode(db, session.accessCode)
      : null;
    const branding = accessCode
      ? await resolveBrandingForAccessCode(db, session.halkaName ?? '', accessCode.branding)
      : null;

    const parchiDesign =
      accessCode && session.halkaName
        ? await resolveParchiDesignForMobile(db, session.halkaName, accessCode)
        : null;

    return NextResponse.json({
      type: 'user',
      halkaName: session.halkaName,
      accessCode: session.accessCode,
      label: accessCode?.label ?? '',
      branding,
      selectAllBlockCodes: accessCode?.selectAllBlockCodes !== false,
      blockCodes: accessCode?.selectAllBlockCodes === false ? accessCode.blockCodes : [],
      parchiDesignId: accessCode?.parchiDesignId ?? null,
      parchiDesign: parchiDesign
        ? {
            _id: parchiDesign._id,
            name: parchiDesign.name,
            designCode: parchiDesign.designCode,
            isDefault: parchiDesign.isDefault,
          }
        : null,
    });
  } catch (error) {
    console.error('Mobile me failed:', error);
    return NextResponse.json({ error: 'Failed to load session' }, { status: 500 });
  } finally {
    await client.close();
  }
}
