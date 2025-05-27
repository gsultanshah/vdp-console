import mongoose from 'mongoose';

const BlockCodeSchema = new mongoose.Schema({
  blockCode: {
    type: String,
    required: [true, 'Block code is required'],
    trim: true
  },
  fileName: {
    type: String,
    required: [true, 'File name is required'],
    trim: true
  },
  url: {
    type: String,
    required: [true, 'URL is required'],
    trim: true
  },
  tag: {
    type: String,
    required: [true, 'Tag is required'],
    trim: true
  },
  halkaName: {
    type: String,
    required: [true, 'Halka name is required'],
    trim: true
  },
  gender: {
    type: String,
    enum: ['male', 'female'],
    required: [true, 'Gender is required']
  },
  religion: {
    type: String,
    enum: ['muslim', 'qadiani'],
    required: [true, 'Religion is required']
  },
  status: {
    type: String,
    enum: ['uploaded', 'pending', 'failed'],
    default: 'pending'
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.models.BlockCode || mongoose.model('BlockCode', BlockCodeSchema); 