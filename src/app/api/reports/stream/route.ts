import connectDB from '@/lib/mongodb';
import { connectNativeMongoClient } from '@/lib/mongo-client';
import Constituency from '@/models/Constituency';
import { unauthorizedResponse } from '@/lib/auth';
import {
  buildHalkaFilter,
  canAccessHalka,
  getAllowedHalkaName,
  hasAllConstituencyAccess,
} from '@/lib/constituency-access';
import { resolveSessionUser } from '@/lib/session-user';
import { createNdjsonStream } from '@/lib/ndjson-stream';
import {
  aggregateGlobalPages,
  aggregateGlobalVoterStats,
  aggregatePagesByHalkaStatus,
  aggregateVotersByHalka,
  aggregateWorkProgress,
  buildConstituencyRows,
  tallyPageStats,
} from '@/lib/reports-aggregations';

export const dynamic = 'force-dynamic';

function applyWorkStatusWithUntracked(
  byStatus: Record<string, number>,
  totalBlockCodes: number
): Record<string, number> {
  const next = { ...byStatus };
  const tracked = Object.values(byStatus).reduce((sum, value) => sum + value, 0);
  const implicitPending = Math.max(0, totalBlockCodes - tracked);
  next.pending = (next.pending ?? 0) + implicitPending;
  return next;
}

export async function GET(request: Request) {
  const sessionUser = await resolveSessionUser(request);
  if (!sessionUser) {
    return unauthorizedResponse();
  }

  const { searchParams } = new URL(request.url);
  const halkaNameParam = searchParams.get('halkaName')?.trim() || null;

  if (halkaNameParam && !canAccessHalka(sessionUser, halkaNameParam)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  return createNdjsonStream(
    async (enqueue, isStopped) => {
      await connectDB();
      const accessFilter = buildHalkaFilter(sessionUser);

      const allConstituencies = await Constituency.find({
        deletedAt: null,
        ...accessFilter,
      })
        .sort({ halkaName: 1 })
        .lean<
          Array<{
            halkaName: string;
            status?: string;
            totalVoters?: number;
            muslimMale?: number;
            muslimFemale?: number;
            qadianiMale?: number;
            qadianiFemale?: number;
            blockCodes?: string[];
            lastUpdated?: Date;
          }>
        >();

      const availableConstituencies = allConstituencies.map((doc) => doc.halkaName);
      const constituencies = halkaNameParam
        ? allConstituencies.filter((doc) => doc.halkaName === halkaNameParam)
        : allConstituencies;

      if (halkaNameParam && constituencies.length === 0) {
        enqueue({ type: 'error', error: 'Constituency not found' });
        return;
      }

      const queryFilter = halkaNameParam ? { halkaName: halkaNameParam } : accessFilter;

      const totalBlockCodes = constituencies.reduce(
        (sum, doc) => sum + (doc.blockCodes?.length ?? 0),
        0
      );
      const estimatedVoters = constituencies.reduce(
        (sum, doc) => sum + (doc.totalVoters ?? 0),
        0
      );

      const client = await connectNativeMongoClient();
      const db = client.db('vdp');

      try {
        const [globalPages, workProgress] = await Promise.all([
          aggregateGlobalPages(db, queryFilter),
          aggregateWorkProgress(db, queryFilter),
        ]);

        const pages = tallyPageStats(globalPages.byStatus);
        const workByStatus = applyWorkStatusWithUntracked(workProgress.byStatus, totalBlockCodes);
        const doneWork = (workByStatus.completed ?? 0) + (workByStatus.verified ?? 0);

        if (
          !enqueue({
            type: 'meta',
            generatedAt: new Date().toISOString(),
            scope: {
              isAdmin: sessionUser.role === 'admin',
              hasAllAccess: hasAllConstituencyAccess(sessionUser),
              allowedHalkaName: getAllowedHalkaName(sessionUser),
              userName: sessionUser.name,
            },
            availableConstituencies,
            selectedConstituency: halkaNameParam,
          })
        ) {
          return;
        }

        if (
          !enqueue({
            type: 'summary',
            summary: {
              constituencies: constituencies.length,
              activeConstituencies: constituencies.filter((doc) => doc.status !== 'inactive').length,
              blockCodes: totalBlockCodes,
              pages,
              voters: { count: estimatedVoters, male: 0, female: 0 },
              workProgress: {
                tracked: Object.values(workProgress.byStatus).reduce((sum, value) => sum + value, 0),
                completionPercent:
                  totalBlockCodes > 0 ? Math.round((doneWork / totalBlockCodes) * 100) : 0,
                byStatus: workByStatus,
              },
            },
            global: {
              pagesByStatus: globalPages.byStatus,
              pagesByTag: globalPages.byTag,
              votersByGender: { count: estimatedVoters, male: 0, female: 0 },
              workByStatus,
            },
          })
        ) {
          return;
        }

        if (isStopped()) {
          return;
        }

        enqueue({
          type: 'progress',
          phase: 'voters',
          message: 'Counting registered voters…',
        });

        const [globalVoters, votersByHalka, pagesByHalka] = await Promise.all([
          aggregateGlobalVoterStats(db, queryFilter),
          aggregateVotersByHalka(db, queryFilter),
          aggregatePagesByHalkaStatus(db, queryFilter),
        ]);

        if (isStopped()) {
          return;
        }

        enqueue({
          type: 'voters',
          voters: globalVoters,
          workByStatus,
        });

        const constituencyRows = buildConstituencyRows(
          constituencies,
          votersByHalka,
          pagesByHalka,
          workProgress.byHalka
        );

        enqueue({
          type: 'progress',
          phase: 'constituencies',
          message: 'Loading constituency breakdown…',
          total: constituencyRows.length,
          current: 0,
        });

        for (let index = 0; index < constituencyRows.length; index += 1) {
          if (isStopped()) {
            return;
          }
          if (
            !enqueue({
              type: 'constituency',
              row: constituencyRows[index],
            })
          ) {
            return;
          }
        }

        enqueue({ type: 'done', phase: 'overview' });
      } finally {
        await client.close();
      }
    },
    request.signal
  );
}
