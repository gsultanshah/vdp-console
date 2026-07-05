import type { ObjectId } from 'mongodb';
import type { Model } from 'mongoose';

export interface BlockPageNeighbor {
  _id: string;
  fileName: string;
}

export interface BlockPageNavigation {
  pageIndex: number;
  totalPages: number;
  previous: BlockPageNeighbor | null;
  next: BlockPageNeighbor | null;
}

interface BlockPageDoc {
  _id: ObjectId;
  blockCode: string;
  halkaName: string;
  fileName: string;
  uploadedAt?: Date | null;
}

function neighborFilter(
  doc: BlockPageDoc,
  direction: 'previous' | 'next'
): Record<string, unknown> {
  const uploadedAt = doc.uploadedAt ?? new Date(0);
  const base = { blockCode: doc.blockCode, halkaName: doc.halkaName };

  if (direction === 'previous') {
    return {
      ...base,
      $or: [{ uploadedAt: { $lt: uploadedAt } }, { uploadedAt, _id: { $lt: doc._id } }],
    };
  }

  return {
    ...base,
    $or: [{ uploadedAt: { $gt: uploadedAt } }, { uploadedAt, _id: { $gt: doc._id } }],
  };
}

function toNeighbor(doc: { _id: ObjectId; fileName: string } | null): BlockPageNeighbor | null {
  if (!doc) {
    return null;
  }
  return {
    _id: doc._id.toString(),
    fileName: doc.fileName,
  };
}

export async function getBlockPageNavigation(
  BlockCodeModel: Model<unknown>,
  doc: BlockPageDoc
): Promise<BlockPageNavigation> {
  const scope = { blockCode: doc.blockCode, halkaName: doc.halkaName };

  const [previousDoc, nextDoc, pagesBefore, totalPages] = await Promise.all([
    BlockCodeModel.findOne(neighborFilter(doc, 'previous'))
      .sort({ uploadedAt: -1, _id: -1 })
      .select('_id fileName')
      .lean<{ _id: ObjectId; fileName: string } | null>(),
    BlockCodeModel.findOne(neighborFilter(doc, 'next'))
      .sort({ uploadedAt: 1, _id: 1 })
      .select('_id fileName')
      .lean<{ _id: ObjectId; fileName: string } | null>(),
    BlockCodeModel.countDocuments(neighborFilter(doc, 'previous')),
    BlockCodeModel.countDocuments(scope),
  ]);

  return {
    pageIndex: pagesBefore + 1,
    totalPages,
    previous: toNeighbor(previousDoc),
    next: toNeighbor(nextDoc),
  };
}
