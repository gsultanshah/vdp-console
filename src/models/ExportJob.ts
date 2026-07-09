import mongoose from 'mongoose';
import type {
  ExportFormat,
  ExportGenderFilter,
  ExportJobStatus,
  ExportMode,
  ExportTableColumnMeta,
} from '@/lib/export-fields';

const BlockCodeProgressSchema = new mongoose.Schema(
  {
    blockCode: { type: String, required: true },
    halkaName: { type: String, required: true },
    totalVoters: { type: Number, default: 0 },
    processedVoters: { type: Number, default: 0 },
    lastVoterId: { type: String, default: null },
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed', 'size_exceeded'],
      default: 'pending',
    },
    fileName: { type: String, default: null },
    filePath: { type: String, default: null },
    fileSizeBytes: { type: Number, default: 0 },
    rowCount: { type: Number, default: 0 },
    partIndex: { type: Number, default: 0 },
    partRowCount: { type: Number, default: 0 },
    genderPhase: { type: String, enum: ['male', 'female'], default: 'male' },
    error: { type: String, default: null },
  },
  { _id: false }
);

const OutputFileSchema = new mongoose.Schema(
  {
    blockCode: { type: String, default: null },
    halkaName: { type: String, default: null },
    fileName: { type: String, required: true },
    filePath: { type: String, required: true },
    sizeBytes: { type: Number, default: 0 },
    rowCount: { type: Number, default: 0 },
  },
  { _id: false }
);

const ExportJobSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ['pending', 'running', 'completed', 'failed', 'cancelled', 'size_exceeded'],
    default: 'pending',
  },
  createdBy: { type: String, required: true },
  createdByName: { type: String, default: '' },
  halkaNames: [{ type: String }],
  blockCodes: [{ type: String }],
  selectAllBlockCodes: { type: Boolean, default: false },
  fields: [{ type: String }],
  includeTableColumns: { type: Boolean, default: false },
  tableColumns: [{
    id: String,
    label: String,
    index: Number,
  }],
  format: { type: String, enum: ['csv', 'xlsx'], default: 'csv' },
  mode: { type: String, enum: ['custom', 'default_per_blockcode'], default: 'custom' },
  genderFilter: { type: String, enum: ['both', 'male', 'female'], default: 'both' },
  combinedGenderPhase: { type: String, enum: ['male', 'female'], default: 'male' },
  totalVoters: { type: Number, default: 0 },
  processedVoters: { type: Number, default: 0 },
  currentBlockIndex: { type: Number, default: 0 },
  blockCodeProgress: [BlockCodeProgressSchema],
  outputFiles: [OutputFileSchema],
  combinedFilePath: { type: String, default: null },
  combinedFileName: { type: String, default: null },
  combinedLastVoterId: { type: String, default: null },
  combinedRowCount: { type: Number, default: 0 },
  combinedPartRowCount: { type: Number, default: 0 },
  combinedFileSizeBytes: { type: Number, default: 0 },
  splitLargeFiles: { type: Boolean, default: false },
  error: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  completedAt: { type: Date, default: null },
});

ExportJobSchema.pre('save', function saveHook(next) {
  this.updatedAt = new Date();
  next();
});

export interface BlockCodeProgressDoc {
  blockCode: string;
  halkaName: string;
  totalVoters: number;
  processedVoters: number;
  lastVoterId: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'size_exceeded';
  fileName: string | null;
  filePath: string | null;
  fileSizeBytes: number;
  rowCount: number;
  partIndex: number;
  partRowCount: number;
  genderPhase: 'male' | 'female';
  error: string | null;
}

export interface OutputFileDoc {
  blockCode: string | null;
  halkaName: string | null;
  fileName: string;
  filePath: string;
  sizeBytes: number;
  rowCount: number;
}

export interface ExportJobDoc {
  _id: mongoose.Types.ObjectId;
  status: ExportJobStatus;
  createdBy: string;
  createdByName: string;
  halkaNames: string[];
  blockCodes: string[];
  selectAllBlockCodes: boolean;
  fields: string[];
  includeTableColumns: boolean;
  tableColumns: ExportTableColumnMeta[];
  format: ExportFormat;
  mode: ExportMode;
  genderFilter: ExportGenderFilter;
  combinedGenderPhase: 'male' | 'female';
  totalVoters: number;
  processedVoters: number;
  currentBlockIndex: number;
  blockCodeProgress: BlockCodeProgressDoc[];
  outputFiles: OutputFileDoc[];
  combinedFilePath: string | null;
  combinedFileName: string | null;
  combinedLastVoterId: string | null;
  combinedRowCount: number;
  combinedPartRowCount: number;
  combinedFileSizeBytes: number;
  splitLargeFiles: boolean;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export default mongoose.models.ExportJob || mongoose.model('ExportJob', ExportJobSchema);
