import connectDB from '@/lib/mongodb';
import { connectNativeMongoClient } from '@/lib/mongo-client';
import Constituency from '@/models/Constituency';
import { unauthorizedResponse } from '@/lib/auth';
import { buildHalkaFilter, canAccessHalka } from '@/lib/constituency-access';
import { resolveSessionUser } from '@/lib/session-user';
import { createNdjsonStream } from '@/lib/ndjson-stream';
import {
  aggregateBlockCodePages,
  aggregateVotersByBlock,
  aggregateWorkProgress,
} from '@/lib/reports-aggregations';
import type { ReportsBlockCodeRow } from '@/lib/reports-types';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const sessionUser = await resolveSessionUser(request);
  if (!sessionUser) {
    return unauthorizedResponse();
  }

  const { searchParams } = new URL(request.url);
  const halkaNameFilter = searchParams.get('halkaName')?.trim();

  if (halkaNameFilter && !canAccessHalka(sessionUser, halkaNameFilter)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  return createNdjsonStream(
    async (enqueue, isStopped) => {
      await connectDB();
      const halkaFilter = buildHalkaFilter(sessionUser);

      const constituencies = await Constituency.find({
        deletedAt: null,
        ...halkaFilter,
        ...(halkaNameFilter ? { halkaName: halkaNameFilter } : {}),
      })
        .sort({ halkaName: 1 })
        .lean<Array<{ halkaName: string; blockCodes?: string[] }>>();

      const totalBlocks = constituencies.reduce(
        (sum, doc) => sum + (doc.blockCodes?.length ?? 0),
        0
      );

      if (!enqueue({ type: 'meta', totalBlocks })) {
        return;
      }

      const client = await connectNativeMongoClient();
      const db = client.db('vdp');

      try {
        const scopedFilter = halkaNameFilter ? { halkaName: halkaNameFilter } : halkaFilter;

        const [blockPages, workProgress] = await Promise.all([
          aggregateBlockCodePages(db, scopedFilter),
          aggregateWorkProgress(db, scopedFilter),
        ]);

        let processed = 0;

        for (const constituency of constituencies) {
          if (isStopped()) {
            return;
          }

          enqueue({
            type: 'progress',
            phase: 'blocks',
            message: `Loading blocks for ${constituency.halkaName}…`,
            current: processed,
            total: totalBlocks,
          });

          const votersByBlock = await aggregateVotersByBlock(db, {
            halkaName: constituency.halkaName,
          });

          for (const blockCode of constituency.blockCodes ?? []) {
            if (isStopped()) {
              return;
            }

            const key = `${constituency.halkaName}::${blockCode}`;
            const pages = blockPages.get(key);
            const voters = votersByBlock.get(key);

            const row: ReportsBlockCodeRow = {
              halkaName: constituency.halkaName,
              blockCode,
              pages: pages?.pages ?? 0,
              pagesCompleted: pages?.pagesCompleted ?? 0,
              pagesProcessing: pages?.pagesProcessing ?? 0,
              pagesError: pages?.pagesError ?? 0,
              voters: {
                count: voters?.count ?? 0,
                male: voters?.male ?? 0,
                female: voters?.female ?? 0,
              },
              workStatus: workProgress.byBlock.get(key) ?? 'pending',
              pageTags: pages?.pageTags ?? {},
            };

            if (!enqueue({ type: 'blockCode', row })) {
              return;
            }

            processed += 1;
          }
        }

        enqueue({ type: 'done' });
      } finally {
        await client.close();
      }
    },
    request.signal
  );
}
