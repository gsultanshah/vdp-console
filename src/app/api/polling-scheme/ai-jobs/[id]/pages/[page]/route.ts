import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import connectDB from '@/lib/mongodb';
import { forbiddenResponse, requireAdmin, unauthorizedResponse } from '@/lib/auth';
import { canAccessHalka } from '@/lib/constituency-access';
import { resolveSessionUser } from '@/lib/session-user';
import {
  getPollingSchemeAiJob,
  getPollingSchemePageImagePath,
  recordPageProcessingResult,
} from '@/lib/polling-scheme/ai-job-service';
import { getSignedReadUrl, verifyStorageObject } from '@/lib/firebase-storage';
import { extractPollingSchemePage } from '@/lib/polling-scheme/openai-extractor';
import {
  applyStationInheritance,
  normalizeExtractedRow,
  pickStationContext,
  validateExtractedPage,
} from '@/lib/polling-scheme/ai-validation';
import {
  ensurePollingSchemeUpsertIndexes,
  upsertPollingSchemeRows,
} from '@/lib/polling-scheme/upsert-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

function authError(request: Request) {
  const hasSession = request.headers.get('cookie')?.includes('user=');
  return hasSession ? forbiddenResponse() : unauthorizedResponse();
}

export async function POST(
  request: Request,
  { params }: { params: { id: string; page: string } }
) {
  const admin = requireAdmin(request);
  if (!admin) {
    return authError(request);
  }

  const page = Number(params.page);
  if (!Number.isFinite(page) || page < 1) {
    return NextResponse.json({ error: 'Invalid page number' }, { status: 400 });
  }

  const job = await getPollingSchemeAiJob(params.id);
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const sessionUser = await resolveSessionUser(request);
  if (!canAccessHalka(sessionUser, job.halkaName)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const pageState = job.pages.find((item) => item.page === page);
  if (pageState?.status === 'completed') {
    return NextResponse.json({
      job,
      skipped: true,
      message: `Page ${page} already processed`,
    });
  }

  let body: { imageHash?: string; retry?: boolean } = {};
  try {
    const text = await request.text();
    if (text) {
      body = JSON.parse(text);
    }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const imagePath = pageState?.imagePath ?? (await getPollingSchemePageImagePath(job, page));
  const imageHash = body.imageHash?.trim() ?? pageState?.imageHash ?? '';

  try {
    const verified = await verifyStorageObject(imagePath);
    if (!verified.exists) {
      return NextResponse.json({ error: 'Page image not uploaded yet' }, { status: 400 });
    }

    const imageUrl = await getSignedReadUrl(imagePath);
    const priorContext = page > 1 ? job.lastStationContext : null;

    const { extraction, verified: usedVerifyPass, usage } = await extractPollingSchemePage(
      imageUrl,
      page,
      priorContext,
      { forceVerify: Boolean(body.retry) }
    );

    const validationIssues = validateExtractedPage(extraction);
    const errors = validationIssues.filter((issue) => issue.level === 'error');
    const warnings = validationIssues.filter((issue) => issue.level === 'warn');

    if (errors.length > 0 && !body.retry) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          issues: validationIssues,
          extraction,
          retryRecommended: true,
        },
        { status: 422 }
      );
    }

    const normalizedRows = applyStationInheritance(
      extraction.rows.map((row) => normalizeExtractedRow(row, page, extraction.district)),
      priorContext
    );

    await connectDB();
    const { default: mongoose } = await import('mongoose');
    const pollingScheme = mongoose.connection.collection('polling_scheme');
    const importsCollection = mongoose.connection.collection('polling_scheme_imports');
    await ensurePollingSchemeUpsertIndexes(pollingScheme);

    const importId = new ObjectId();
    const now = new Date();
    await importsCollection.insertOne({
      halkaName: job.halkaName,
      district: job.district,
      source: 'pdf-ai',
      sourceFileName: job.fileName,
      sourceFileUrl: job.sourceFileUrl ?? '',
      sourceStoragePath: job.sourceStoragePath,
      aiJobId: job._id,
      sourcePage: page,
      status: 'processing',
      createdAt: now,
    });

    const upsertResult = await upsertPollingSchemeRows({
      rows: normalizedRows,
      halkaName: job.halkaName,
      source: 'pdf-ai',
      sourceFileName: job.fileName,
      sourceFileUrl: job.sourceFileUrl ?? '',
      sourceStoragePath: job.sourceStoragePath,
      importId,
      jobId: job._id,
      page,
      pageImageHash: imageHash || `page-${page}`,
      importedAt: now,
      collection: pollingScheme,
    });

    await importsCollection.updateOne(
      { _id: importId },
      {
        $set: {
          status: 'completed',
          insertedRows: upsertResult.upserted + upsertResult.updated,
          skippedRows: upsertResult.skipped,
          errorCount: upsertResult.errors.length,
          completedAt: new Date(),
        },
      }
    );

    const stationContext = pickStationContext(extraction);
    const logMessage = `Page ${page}: extracted ${normalizedRows.length} rows, upserted ${upsertResult.upserted}, updated ${upsertResult.updated}, skipped ${upsertResult.skipped}${usedVerifyPass ? ' (verified)' : ''}`;

    const updatedJob = await recordPageProcessingResult({
      jobId: params.id,
      page,
      pageState: {
        imagePath,
        imageHash: imageHash || undefined,
        warnings: [
          ...warnings.map((issue) => issue.message),
          ...upsertResult.errors,
        ],
        usage,
      },
      rowsExtracted: normalizedRows.length,
      rowsUpserted: upsertResult.upserted + upsertResult.updated,
      rowsSkipped: upsertResult.skipped,
      warnings: warnings.length,
      errors: errors.length + upsertResult.errors.length,
      stationContext,
      logMessage,
      failed: false,
    });

    return NextResponse.json({
      job: updatedJob,
      extraction,
      upsert: upsertResult,
      validationIssues,
      verified: usedVerifyPass,
    });
  } catch (error) {
    console.error(`Page ${page} processing failed:`, error);
    const message = error instanceof Error ? error.message : 'Page processing failed';

    const updatedJob = await recordPageProcessingResult({
      jobId: params.id,
      page,
      pageState: {
        imagePath,
        imageHash: imageHash || undefined,
        error: message,
      },
      rowsExtracted: 0,
      rowsUpserted: 0,
      rowsSkipped: 0,
      warnings: 0,
      errors: 1,
      stationContext: job.lastStationContext,
      logMessage: `Page ${page} failed: ${message}`,
      failed: true,
    });

    return NextResponse.json(
      { error: message, job: updatedJob },
      { status: 500 }
    );
  }
}
