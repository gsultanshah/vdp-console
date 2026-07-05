import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import BlockCode from '@/models/BlockCode';
import { MAX_UPLOAD_PAGE_SIZE, UPLOAD_PREVIEW_COUNT } from '@/lib/blockcode-uploads';
import { assertBlockCodeIsActive, assertHalkaIsActive } from '@/lib/constituency';
import { canAccessHalka } from '@/lib/constituency-access';
import { resolveSessionUser } from '@/lib/session-user';

export const dynamic = 'force-dynamic';

const UPLOAD_LIST_SELECT =
  '_id blockCode fileName url tag halkaName gender religion status uploadedAt';

function encodeNdjson(payload: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(payload)}\n`);
}

async function streamUploadPage(
  query: { blockCode?: string; halkaName?: string },
  page: number,
  limit: number,
  skip: number
) {
  const previewCount = Math.min(UPLOAD_PREVIEW_COUNT, limit);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(
          encodeNdjson({
            type: 'meta',
            currentPage: page,
            pageSize: limit,
            previewCount,
          })
        );

        const countPromise = BlockCode.countDocuments(query);

        const previewDocs = await BlockCode.find(query)
          .select(UPLOAD_LIST_SELECT)
          .sort({ uploadedAt: 1 })
          .skip(skip)
          .limit(previewCount)
          .lean();

        for (const doc of previewDocs) {
          controller.enqueue(
            encodeNdjson({
              type: 'upload',
              upload: doc,
            })
          );
        }

        controller.enqueue(
          encodeNdjson({
            type: 'preview',
            count: previewDocs.length,
          })
        );

        if (limit > previewCount) {
          const cursor = BlockCode.find(query)
            .select(UPLOAD_LIST_SELECT)
            .sort({ uploadedAt: 1 })
            .skip(skip + previewCount)
            .limit(limit - previewCount)
            .lean()
            .cursor();

          for await (const doc of cursor) {
            controller.enqueue(
              encodeNdjson({
                type: 'upload',
                upload: doc,
              })
            );
          }
        }

        const total = await countPromise;
        controller.enqueue(
          encodeNdjson({
            type: 'done',
            total,
            totalPages: Math.max(1, Math.ceil(total / limit)),
            currentPage: page,
            pageSize: limit,
          })
        );
        controller.close();
      } catch (error) {
        console.error('Error streaming block codes:', error);
        controller.enqueue(
          encodeNdjson({
            type: 'error',
            error: error instanceof Error ? error.message : 'Failed to fetch block codes',
          })
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
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

    const query = blockCode ? { blockCode } : { halkaName: halkaName! };
    const pageParam = searchParams.get('page');
    const allowInactive = searchParams.get('allowInactive') === 'true';
    const stream = searchParams.get('stream') === 'true';
    const lite =
      searchParams.get('lite') !== 'false' &&
      (searchParams.get('lite') === 'true' || Boolean(pageParam) || stream);
    const projection = lite ? UPLOAD_LIST_SELECT : undefined;

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
        return streamUploadPage(query, page, limit, skip);
      }

      const [total, blockCodes] = await Promise.all([
        BlockCode.countDocuments(query),
        lite
          ? BlockCode.find(query).select(projection!).sort({ uploadedAt: 1 }).skip(skip).limit(limit).lean()
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

    const blockCodes = lite
      ? await BlockCode.find(query).select(projection!).sort({ uploadedAt: 1 }).lean()
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
