import mongoose from 'mongoose';

const EstimateSchema = new mongoose.Schema({
  muslimFemale: Number,
  muslimMale: Number,
  qadianiFemale: Number,
  qadianiMale: Number,
  totalVoters: Number,
  estimatedAt: {
    type: Date,
    default: Date.now
  }
});

const TableColumnDefinitionSchema = new mongoose.Schema({
  id: String,
  label: String,
  minXRatio: Number,
  maxXRatio: Number,
  index: Number,
}, { _id: false });

const TableColumnSettingsSchema = new mongoose.Schema({
  columns: [TableColumnDefinitionSchema],
  sourcePageId: String,
  updatedAt: Date,
}, { _id: false });

const BlockCodeTableColumnSettingsSchema = new mongoose.Schema({
  blockCode: { type: String, required: true },
  columns: [TableColumnDefinitionSchema],
  sourcePageId: String,
  updatedAt: Date,
}, { _id: false });

const ConstituencySchema = new mongoose.Schema({
  halkaName: {
    type: String,
    required: [true, 'Halka name is required'],
    trim: true
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  muslimFemale: {
    type: Number,
    default: 0
  },
  muslimMale: {
    type: Number,
    default: 0
  },
  qadianiFemale: {
    type: Number,
    default: 0
  },
  qadianiMale: {
    type: Number,
    default: 0
  },
  totalVoters: {
    type: Number,
    default: 0
  },
  blockCodes: [{
    type: String,
    trim: true
  }],
  deletedBlockCodes: [{
    blockCode: { type: String, trim: true, required: true },
    deletedAt: { type: Date, default: Date.now },
    deletedBy: { type: String, default: null },
    deletedByName: { type: String, default: null },
  }],
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
  },
  deletedAt: {
    type: Date,
    default: null,
  },
  estimates: [EstimateSchema],
  tableColumnSettings: {
    type: TableColumnSettingsSchema,
    default: null,
  },
  blockCodeColumnSettings: {
    type: [BlockCodeTableColumnSettingsSchema],
    default: [],
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt timestamp before saving
ConstituencySchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

export default mongoose.models.Constituency || mongoose.model('Constituency', ConstituencySchema); 