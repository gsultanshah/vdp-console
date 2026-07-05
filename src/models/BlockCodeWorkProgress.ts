import mongoose from 'mongoose';
import { BLOCK_WORK_STATUSES } from '@/lib/block-work-progress';

const WorkProgressUserSchema = new mongoose.Schema(
  {
    userId: String,
    email: { type: String, required: true },
    name: String,
  },
  { _id: false }
);

const WorkProgressHistorySchema = new mongoose.Schema(
  {
    status: { type: String, enum: BLOCK_WORK_STATUSES, required: true },
    comments: { type: String, default: '' },
    changedAt: { type: Date, default: Date.now },
    changedBy: { type: WorkProgressUserSchema, required: true },
  },
  { _id: false }
);

const BlockCodeWorkProgressSchema = new mongoose.Schema(
  {
    halkaName: { type: String, required: true, trim: true, index: true },
    blockCode: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: BLOCK_WORK_STATUSES,
      default: 'pending',
    },
    comments: { type: String, default: '' },
    updatedBy: WorkProgressUserSchema,
    history: { type: [WorkProgressHistorySchema], default: [] },
  },
  { timestamps: true }
);

BlockCodeWorkProgressSchema.index({ halkaName: 1, blockCode: 1 }, { unique: true });

export default mongoose.models.BlockCodeWorkProgress ||
  mongoose.model('BlockCodeWorkProgress', BlockCodeWorkProgressSchema, 'blockcodeworkprogress');
