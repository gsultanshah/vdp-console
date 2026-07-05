import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectNativeMongoClient } from '@/lib/mongo-client';
import { canAccessHalka } from '@/lib/constituency-access';
import { unauthorizedResponse } from '@/lib/auth';
import { resolveSessionUser } from '@/lib/session-user';
import {
  buildSpreadsheetRowImageInput,
  extractSpreadsheetFieldsFromRowImage,
  mapWithConcurrency,
  type SpreadsheetAiExtraction,
  type SpreadsheetAiExtractionContext,
} from '@/lib/openai-spreadsheet-fields';
import { type SpreadsheetFieldIssue } from '@/lib/spreadsheet-field-validation';
import type { VoterReproductionData } from '@/lib/voter-document';

export const dynamic = 'force-dynamic';

const AI_FIX_CONCURRENCY = 4;

interface VoterDoc {
  _id: ObjectId;
  halkaName?: string;
  silsilaNo?: string;
  age?: string | null;
  imageUrl?: string;
  rowY?: number;
  rowHeight?: number;
  reproduction?: VoterReproductionData;
}

interface AiFixRequestItem {
  id: string;
  currentSilsilaNo?: string;
  currentAge?: string;
  issues?: SpreadsheetFieldIssue[];
  neighborBeforeSilsila?: string;
  neighborAfterSilsila?: string;
  duplicateSilsilaInBlock?: string[];
}

export async function POST(request: Request) {
  const sessionUser = await resolveSessionUser(request);
  if (!sessionUser) {
    return unauthorizedResponse();
  }

  const body = (await request.json()) as { fixes?: unknown };
  const fixes = Array.isArray(body.fixes)
    ? (body.fixes as AiFixRequestItem[]).filter((item) => item?.id)
    : [];

  if (!fixes.length) {
    return NextResponse.json({ error: 'fixes is required' }, { status: 400 });
  }

  if (fixes.length > 100) {
    return NextResponse.json({ error: 'At most 100 voters per AI fix request' }, { status: 400 });
  }

  const invalidIds = fixes.filter((item) => !ObjectId.isValid(String(item.id)));
  if (invalidIds.length) {
    return NextResponse.json({ error: 'One or more voter ids are invalid' }, { status: 400 });
  }

  const client = await connectNativeMongoClient();
  const db = client.db('vdp');

  try {
    const objectIds = fixes.map((item) => new ObjectId(String(item.id)));
    const voters = await db
      .collection('voters')
      .find({ _id: { $in: objectIds } })
      .project({
        _id: 1,
        halkaName: 1,
        silsilaNo: 1,
        age: 1,
        imageUrl: 1,
        rowY: 1,
        rowHeight: 1,
        reproduction: 1,
      })
      .toArray();

    const voterById = new Map(voters.map((voter) => [String(voter._id), voter as VoterDoc]));
    const fixById = new Map(fixes.map((item) => [String(item.id), item]));

    const results = await mapWithConcurrency(fixes, AI_FIX_CONCURRENCY, async (item) => {
      const voterId = String(item.id);
      const voter = voterById.get(voterId);
      const fixContext = fixById.get(voterId);

      if (!voter) {
        return { id: voterId, error: 'Voter not found' };
      }

      const halkaName = String(voter.halkaName ?? '');
      if (!canAccessHalka(sessionUser, halkaName)) {
        return { id: voterId, error: 'Forbidden' };
      }

      const imageInput = await buildSpreadsheetRowImageInput(voter);
      if (!imageInput) {
        return { id: voterId, error: 'No row scan available for this voter' };
      }

      const extractionContext: SpreadsheetAiExtractionContext = {
        currentSilsilaNo: fixContext?.currentSilsilaNo ?? String(voter.silsilaNo ?? ''),
        currentAge: fixContext?.currentAge ?? String(voter.age ?? ''),
        issues: fixContext?.issues,
        neighborBeforeSilsila: fixContext?.neighborBeforeSilsila,
        neighborAfterSilsila: fixContext?.neighborAfterSilsila,
        duplicateSilsilaInBlock: fixContext?.duplicateSilsilaInBlock,
      };

      try {
        const extracted: SpreadsheetAiExtraction = await extractSpreadsheetFieldsFromRowImage(
          imageInput,
          extractionContext
        );
        if (!extracted.silsilaNo && !extracted.age) {
          return {
            id: voterId,
            error: extracted.error || 'Could not read silsila or age from row scan',
          };
        }

        return {
          id: voterId,
          silsilaNo: extracted.silsilaNo || undefined,
          age: extracted.age || undefined,
          confidence: extracted.confidence || undefined,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'AI extraction failed';
        return { id: voterId, error: message };
      }
    });

    const updated = results.filter((result) => !result.error && (result.silsilaNo || result.age)).length;
    const failed = results.filter((result) => result.error).length;

    return NextResponse.json({
      results,
      message: `AI read page cuts for ${updated} voter(s)${failed ? `, ${failed} failed` : ''}`,
    });
  } catch (error) {
    console.error('Spreadsheet AI fix failed:', error);
    const message = error instanceof Error ? error.message : 'Spreadsheet AI fix failed';
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await client.close();
  }
}
