import { NextResponse } from 'next/server';
import { forbiddenResponse, requireAdmin, unauthorizedResponse } from '@/lib/auth';
import { createExportJob, listExportJobs } from '@/lib/voter-export';
import type { ExportFormat, ExportMode } from '@/lib/export-fields';

export const dynamic = 'force-dynamic';

function adminGuard(request: Request) {
  const admin = requireAdmin(request);
  if (!admin) {
    const hasSession = request.headers.get('cookie')?.includes('user=');
    return { admin: null, response: hasSession ? forbiddenResponse() : unauthorizedResponse() };
  }
  return { admin, response: null };
}

export async function GET(request: Request) {
  const { response } = adminGuard(request);
  if (response) {
    return response;
  }

  try {
    const jobs = await listExportJobs(30);
    return NextResponse.json({ jobs });
  } catch (error) {
    console.error('List exports failed:', error);
    return NextResponse.json({ error: 'Failed to list export jobs' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { admin, response } = adminGuard(request);
  if (response || !admin) {
    return response ?? unauthorizedResponse();
  }

  try {
    const body = (await request.json()) as {
      halkaNames?: string[];
      blockCodes?: string[];
      selectAllBlockCodes?: boolean;
      fields?: string[];
      format?: ExportFormat;
      mode?: ExportMode;
    };

    const job = await createExportJob({
      halkaNames: body.halkaNames ?? [],
      blockCodes: body.blockCodes ?? [],
      selectAllBlockCodes: body.selectAllBlockCodes,
      fields: body.fields,
      format: body.format ?? 'csv',
      mode: body.mode ?? 'custom',
      createdBy: admin.email,
      createdByName: admin.name,
    });

    return NextResponse.json({ job });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create export job';
    const status = message.includes('Select') || message.includes('No block') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
