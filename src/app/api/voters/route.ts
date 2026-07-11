import { NextResponse } from 'next/server';
import type { Db, Document, MongoClient, Sort, FindCursor, Collection } from 'mongodb';
import { connectNativeMongoClient, getVdpDb } from '@/lib/mongo-client';
import { getInactiveHalkaNames } from '@/lib/constituency';
import { canAccessHalka, getAllowedHalkaName } from '@/lib/constituency-access';
import { resolveSessionUser } from '@/lib/session-user';
import {
  MAX_VOTER_PAGE_SIZE,
  VOTER_LIST_PROJECTION,
  VOTER_SPREADSHEET_PROJECTION,
  VOTER_PREVIEW_COUNT,
} from '@/lib/voter-browse';
import {
  buildMongoSortFromSpreadsheet,
  DEFAULT_SPREADSHEET_SORT,
  isSpreadsheetSortField,
  parseSortDirection,
  voterSortCollation,
  type SpreadsheetSortField,
} from '@/lib/voter-batch';
import { buildFlexibleCnicRegex, isCnicLikeQuery, appendCnicGenderFilter, type GenderFilter } from '@/lib/cnic';

export const dynamic = 'force-dynamic';

function buildVoterQuery(input: {
  blockCode?: string | null;
  halkaName?: string | null;
  inactiveHalkaNames: string[];
  allowedHalka: string | null;
}): Record<string, unknown> | null {
  const query: Record<string, unknown> = {};

  if (input.blockCode) {
    query.blockCode = input.blockCode;
  }

  if (input.halkaName) {
    query.halkaName = input.halkaName;
  } else if (input.allowedHalka) {
    query.halkaName = input.allowedHalka;
  }

  if (input.inactiveHalkaNames.length > 0) {
    const existing = query.halkaName;
    if (typeof existing === 'string') {
      if (input.inactiveHalkaNames.includes(existing)) {
        return null;
      }
    } else {
      query.halkaName = { $nin: input.inactiveHalkaNames };
    }
  }

  if (!input.blockCode && !query.halkaName) {
    return null;
  }

  return query;
}

function encodeNdjson(payload: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(payload)}\n`);
}

function serializeVoter(doc: Document): Record<string, unknown> {
  return {
    ...doc,
    _id: String(doc._id),
  };
}

function applyVoterSort<T extends Document>(
  cursor: FindCursor<T>,
  sort: Sort,
  sortBy: SpreadsheetSortField
): FindCursor<T> {
  const sorted = cursor.sort(sort);
  const collation = voterSortCollation(sortBy);
  return collation ? sorted.collation(collation) : sorted;
}

function sortedVoterFind(
  collection: Collection,
  query: Record<string, unknown>,
  findOptions: { projection?: typeof VOTER_LIST_PROJECTION } | undefined,
  sort: Sort,
  sortBy: SpreadsheetSortField
) {
  return applyVoterSort(collection.find(query, findOptions), sort, sortBy);
}

function createNdjsonStream(
  run: (
    enqueue: (payload: unknown) => boolean,
    isStopped: () => boolean
  ) => Promise<void>,
  signal?: AbortSignal,
  onClose?: () => Promise<void>
) {
  let stopped = false;

  const stop = () => {
    stopped = true;
  };

  signal?.addEventListener('abort', stop, { once: true });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;

      const enqueue = (payload: unknown): boolean => {
        if (stopped || closed) {
          return false;
        }
        try {
          controller.enqueue(encodeNdjson(payload));
          return true;
        } catch {
          closed = true;
          stopped = true;
          return false;
        }
      };

      const closeStream = () => {
        if (closed) {
          return;
        }
        closed = true;
        try {
          controller.close();
        } catch {
          // Client may have already cancelled the stream.
        }
      };

      try {
        await run(enqueue, () => stopped || closed);
      } catch (error) {
        console.error('Error streaming voters:', error);
        enqueue({
          type: 'error',
          error: error instanceof Error ? error.message : 'Failed to fetch voters',
        });
      } finally {
        signal?.removeEventListener('abort', stop);
        closeStream();
        await onClose?.();
      }
    },
    cancel() {
      stop();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

async function streamVotersPage(
  db: Db,
  query: Record<string, unknown>,
  sort: Sort,
  sortBy: SpreadsheetSortField,
  page: number,
  limit: number,
  skip: number,
  projection: typeof VOTER_LIST_PROJECTION | undefined,
  signal: AbortSignal | undefined,
  client: MongoClient
) {
  const previewCount = Math.min(VOTER_PREVIEW_COUNT, limit);
  const collection = db.collection('voters');
  const findOptions = projection ? { projection } : undefined;

  return createNdjsonStream(
    async (enqueue, isStopped) => {
      if (
        !enqueue({
          type: 'meta',
          currentPage: page,
          pageSize: limit,
          previewCount,
        })
      ) {
        return;
      }

      const countPromise = collection.countDocuments(query);

      const previewDocs = await sortedVoterFind(collection, query, findOptions, sort, sortBy)
        .skip(skip)
        .limit(previewCount)
        .toArray();

      if (isStopped()) {
        return;
      }

      for (const doc of previewDocs) {
        if (
          !enqueue({
            type: 'voter',
            voter: serializeVoter(doc),
          })
        ) {
          return;
        }
      }

      if (
        !enqueue({
          type: 'preview',
          count: previewDocs.length,
        })
      ) {
        return;
      }

      if (limit > previewCount) {
        const cursor = applyVoterSort(
          collection.find(query, findOptions),
          sort,
          sortBy
        )
          .skip(skip + previewCount)
          .limit(limit - previewCount);

        for await (const doc of cursor) {
          if (isStopped()) {
            await cursor.close().catch(() => undefined);
            return;
          }
          if (
            !enqueue({
              type: 'voter',
              voter: serializeVoter(doc),
            })
          ) {
            await cursor.close().catch(() => undefined);
            return;
          }
        }
      }

      if (isStopped()) {
        return;
      }

      const total = await countPromise;
      enqueue({
        type: 'done',
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        currentPage: page,
        pageSize: limit,
      });
    },
    signal,
    () => client.close()
  );
}

export async function POST(request: Request) {
  try {
    const voterData = await request.json();

    if (!voterData.cnic || !voterData.halkaName || !voterData.blockCode || voterData.row == null) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const voterRecord = {
      ...voterData,
      rowHeight: voterData.rowHeight ?? 40,
      rowY: voterData.rowY ?? 0,
    };

    const client = await connectNativeMongoClient();
    const db = getVdpDb(client);

    try {
      const existingVoter = await db.collection('voters').findOne({
        cnic: voterData.cnic,
        halkaName: voterData.halkaName,
      });

      if (existingVoter) {
        return NextResponse.json({ message: 'Voter already exists' }, { status: 200 });
      }

      const result = await db.collection('voters').insertOne({
        ...voterRecord,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return NextResponse.json({
        message: 'Voter saved successfully',
        voterId: result.insertedId,
      });
    } finally {
      await client.close();
    }
  } catch (error) {
    console.error('Error saving voter:', error);
    return NextResponse.json({ error: 'Failed to save voter data' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const blockCode = searchParams.get('blockCode');
    const halkaName = searchParams.get('halkaName');
    const pageParam = searchParams.get('page');
    const searchQuery = searchParams.get('q')?.trim();
    const stream = searchParams.get('stream') === 'true';
    const lite = searchParams.get('lite') === 'true';
    const spreadsheet = searchParams.get('spreadsheet') === 'true';
    const genderParam = searchParams.get('gender');
    const genderFilter: GenderFilter =
      genderParam === 'male' || genderParam === 'female' ? genderParam : 'both';

    const sessionUser = await resolveSessionUser(request);
    const inactiveHalkaNames = await getInactiveHalkaNames();
    const allowedHalka = getAllowedHalkaName(sessionUser);

    if (halkaName && !canAccessHalka(sessionUser, halkaName)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const query = buildVoterQuery({
      blockCode,
      halkaName,
      inactiveHalkaNames,
      allowedHalka,
    });

    if (!query) {
      return NextResponse.json(
        { error: 'blockCode or halkaName is required' },
        { status: 400 }
      );
    }

    if (searchQuery) {
      const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const orClauses: Record<string, unknown>[] = [
        { name: { $regex: escaped, $options: 'i' } },
        { silsilaNo: { $regex: escaped, $options: 'i' } },
        { gharanaNo: { $regex: escaped, $options: 'i' } },
        { fatherName: { $regex: escaped, $options: 'i' } },
      ];

      if (isCnicLikeQuery(searchQuery)) {
        const cnicPattern = buildFlexibleCnicRegex(searchQuery);
        if (cnicPattern) {
          orClauses.unshift({ cnic: { $regex: cnicPattern, $options: 'i' } });
        }
      } else {
        orClauses.unshift({ cnic: { $regex: escaped, $options: 'i' } });
      }

      query.$or = orClauses;
    }

    appendCnicGenderFilter(query, genderFilter);

    const sortByParam = searchParams.get('sortBy');
    const sortOrderParam = searchParams.get('sortOrder');
    const sortBy = isSpreadsheetSortField(sortByParam) ? sortByParam : DEFAULT_SPREADSHEET_SORT.sortBy;
    const sortDir = parseSortDirection(sortOrderParam);
    const sort: Sort = buildMongoSortFromSpreadsheet(sortBy, sortDir);
    const projection = spreadsheet
      ? VOTER_SPREADSHEET_PROJECTION
      : lite
        ? VOTER_LIST_PROJECTION
        : undefined;
    const findOptions = projection ? { projection } : undefined;

    if (pageParam) {
      const page = Math.max(1, parseInt(pageParam, 10) || 1);
      const limit = Math.min(
        Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50),
        MAX_VOTER_PAGE_SIZE
      );
      const skip = (page - 1) * limit;

      if (stream) {
        const client = await connectNativeMongoClient();
        const db = getVdpDb(client);
        return streamVotersPage(db, query, sort, sortBy, page, limit, skip, projection, request.signal, client);
      }

      const client = await connectNativeMongoClient();
      const db = getVdpDb(client);

      try {
        const [total, voters] = await Promise.all([
          db.collection('voters').countDocuments(query),
          sortedVoterFind(db.collection('voters'), query, findOptions, sort, sortBy)
            .skip(skip)
            .limit(limit)
            .toArray(),
        ]);

        return NextResponse.json({
          voters: voters.map(serializeVoter),
          currentPage: page,
          totalPages: Math.max(1, Math.ceil(total / limit)),
          total,
          pageSize: limit,
        });
      } finally {
        await client.close();
      }
    }

    const client = await connectNativeMongoClient();
    const db = getVdpDb(client);

    try {
      const voters = await sortedVoterFind(db.collection('voters'), query, findOptions, sort, sortBy).toArray();
      return NextResponse.json(voters.map(serializeVoter));
    } finally {
      await client.close();
    }
  } catch (error) {
    console.error('Error fetching voters:', error);
    return NextResponse.json({ error: 'Failed to fetch voter data' }, { status: 500 });
  }
}
