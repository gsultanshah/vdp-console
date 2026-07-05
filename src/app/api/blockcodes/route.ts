import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import BlockCode from '@/models/BlockCode';
import { MAX_UPLOAD_PAGE_SIZE, UPLOAD_PAGE_ROW_SELECT, UPLOAD_PREVIEW_COUNT } from '@/lib/blockcode-uploads';
import { assertBlockCodeIsActive, assertHalkaIsActive } from '@/lib/constituency';
import { canAccessHalka } from '@/lib/constituency-access';
import { resolveSessionUser } from '@/lib/session-user';

export const dynamic = 'force-dynamic';

const UPLOAD_LIST_SELECT =
  '_id blockCode fileName url tag halkaName gender religion status uploadedAt';

function buildBlockcodeQuery(blockCode: string | null, halkaName: string | null): Record<string, string> {
  if (blockCode && halkaName) {
    return { blockCode, halkaName };
  }
  if (blockCode) {
    return { blockCode };
  }
  return { halkaName: halkaName! };
}

function resolveUploadProjection(
  view: string | null,
  lite: boolean
): string | undefined {
  if (view === 'pages') {
    return UPLOAD_PAGE_ROW_SELECT;
  }
  return lite ? UPLOAD_LIST_SELECT : undefined;
}

function encodeNdjson(payload: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(payload)}\n`);
}

function createNdjsonStream(
  run: (
    enqueue: (payload: unknown) => boolean,
    isStopped: () => boolean
  ) => Promise<void>,
  signal?: AbortSignal
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
        console.error('Error streaming block codes:', error);
        enqueue({
          type: 'error',
          error: error instanceof Error ? error.message : 'Failed to fetch block codes',
        });
      } finally {
        signal?.removeEventListener('abort', stop);
        closeStream();
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

async function streamUploadPage(
  query: Record<string, string>,
  page: number,
  limit: number,
  skip: number,
  projection: string,
  signal?: AbortSignal
) {
  const previewCount = Math.min(UPLOAD_PREVIEW_COUNT, limit);

  return createNdjsonStream(async (enqueue, isStopped) => {
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

    const countPromise = BlockCode.countDocuments(query);

    const previewDocs = await BlockCode.find(query)
      .select(projection)
      .sort({ uploadedAt: 1 })
      .skip(skip)
      .limit(previewCount)
      .lean();

    if (isStopped()) {
      return;
    }

    for (const doc of previewDocs) {
      if (
        !enqueue({
          type: 'upload',
          upload: doc,
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
      const cursor = BlockCode.find(query)
        .select(projection)
        .sort({ uploadedAt: 1 })
        .skip(skip + previewCount)
        .limit(limit - previewCount)
        .lean()
        .cursor();

      for await (const doc of cursor) {
        if (isStopped()) {
          await cursor.close().catch(() => undefined);
          return;
        }
        if (
          !enqueue({
            type: 'upload',
            upload: doc,
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
  }, signal);
}

export async function GET(request: Request) {
  try {
    await connectDB();
    const sessionUser = await resolveSessionUser(request);
    const { searchParams } = new URL(request.url);
    const blockCode = searchParams.get('blockCode');
    const halkaName = searchParams.get('halkaName');

    if (!blockCode && !halkaName) {
      return NextResponse.json(
        { error: 'blockCode or halkaName is required' },
        { status: 400 }
      );
    }

    if (halkaName && !canAccessHalka(sessionUser, halkaName)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const query = buildBlockcodeQuery(blockCode, halkaName);
    const pageParam = searchParams.get('page');
    const allowInactive = searchParams.get('allowInactive') === 'true';
    const stream = searchParams.get('stream') === 'true';
    const view = searchParams.get('view');
    const lite =
      searchParams.get('lite') !== 'false' &&
      (searchParams.get('lite') === 'true' || Boolean(pageParam) || stream);
    const projection = resolveUploadProjection(view, lite);

    if (!allowInactive) {
      if (halkaName) {
        const halkaCheck = await assertHalkaIsActive(halkaName);
        if (!halkaCheck.ok) {
          return NextResponse.json({ error: halkaCheck.error }, { status: 403 });
        }
      } else if (blockCode) {
        const blockCheck = await assertBlockCodeIsActive(blockCode);
        if (!blockCheck.ok) {
          return NextResponse.json({ error: blockCheck.error }, { status: 403 });
        }
      }
    }

    if (pageParam) {
      const page = Math.max(1, parseInt(pageParam, 10) || 1);
      const limit = Math.min(
        Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50),
        MAX_UPLOAD_PAGE_SIZE
      );
      const skip = (page - 1) * limit;

      if (stream) {
        return streamUploadPage(
          query,
          page,
          limit,
          skip,
          projection ?? UPLOAD_LIST_SELECT,
          request.signal
        );
      }

      const [total, blockCodes] = await Promise.all([
        BlockCode.countDocuments(query),
        projection
          ? BlockCode.find(query).select(projection).sort({ uploadedAt: 1 }).skip(skip).limit(limit).lean()
          : BlockCode.find(query).sort({ uploadedAt: 1 }).skip(skip).limit(limit).lean(),
      ]);

      return NextResponse.json({
        uploads: blockCodes,
        currentPage: page,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        total,
        pageSize: limit,
      });
    }

    const blockCodes = projection
      ? await BlockCode.find(query).select(projection).sort({ uploadedAt: 1 }).lean()
      : await BlockCode.find(query).sort({ uploadedAt: 1 }).lean();

    return NextResponse.json(blockCodes);
  } catch (error) {
    console.error('Error fetching block codes:', error);
    return NextResponse.json(
      { error: 'Failed to fetch block codes' },
      { status: 500 }
    );
  }
}
