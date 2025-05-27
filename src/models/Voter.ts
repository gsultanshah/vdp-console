import mongoose from 'mongoose';

const VoterSchema = new mongoose.Schema({
  cnic: {
    type: String,
    required: [true, 'CNIC is required'],
    trim: true
  },
  halkaName: {
    type: String,
    required: [true, 'Halka name is required'],
    trim: true
  },
  blockCode: {
    type: String,
    required: [true, 'Block code is required'],
    trim: true
  },
  silsilaNo: {
    type: String,
    required: [true, 'Silsila number is required'],
    trim: true
  },
  gharanaNo: {
    type: String,
    required: [true, 'Gharana number is required'],
    trim: true
  },
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true
  },
  row: {
    type: Number,
    required: [true, 'Row number is required']
  },
  rowY: {
    type: Number,
    required: [true, 'Row Y position is required']
  },
  rowHeight: {
    type: Number,
    required: [true, 'Row height is required']
  },
  imageUrl: {
    type: String,
    required: [true, 'Image URL is required'],
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt timestamp before saving
VoterSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

export default mongoose.models.Voter || mongoose.model('Voter', VoterSchema); 