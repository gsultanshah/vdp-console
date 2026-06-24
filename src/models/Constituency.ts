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