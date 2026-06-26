import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import BlockCode from '@/models/BlockCode';

export const dynamic = 'force-dynamic';

type BlockCodeLean = {
  _id: mongoose.Types.ObjectId;
  blockCode: string;
  fileName: string;
  url: string;
  tag: string;
  halkaName: string;
  gender: string;
  religion: string;
  status: string;
  uploadedAt?: Date;
  ocrAt?: Date;
  processedAt?: Date;
  ocr_data?: unknown;
};

export async function GET(
  _request: Request,
  { params }: { params: { pageId: string } }
) {
  try {
    const { pageId } = params;

    if (!mongoose.Types.ObjectId.isValid(pageId)) {
      return NextResponse.json({ error: 'Invalid page id' }, { status: 400 });
    }

    await connectDB();

    const doc = await BlockCode.findById(pageId).lean<BlockCodeLean>();

    if (!doc) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    }

    return NextResponse.json({
      page: {
        _id: doc._id.toString(),
        blockCode: doc.blockCode,
        fileName: doc.fileName,
        url: doc.url,
        tag: doc.tag,
        halkaName: doc.halkaName,
        gender: doc.gender,
        religion: doc.religion,
        status: doc.status,
        uploadedAt: doc.uploadedAt,
        ocrAt: doc.ocrAt,
        processedAt: doc.processedAt,
      },
      ocr_data: doc.ocr_data ?? null,
    });
  } catch (error) {
    console.error('Error fetching blockcode page:', error);
    return NextResponse.json(
      { error: 'Failed to fetch page' },
      { status: 500 }
    );
  }
}
