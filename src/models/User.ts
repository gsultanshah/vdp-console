import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide a name'],
  },
  email: {
    type: String,
    required: [true, 'Please provide an email'],
    unique: true,
  },
  password: {
    type: String,
    required: [true, 'Please provide a password'],
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user',
  },
  constituencyAccess: {
    type: String,
    default: 'all',
  },
  resetToken: {
    type: String,
  },
  resetTokenExpiry: {
    type: Date,
  },
  deletedAt: {
    type: Date,
    default: null,
  },
  deletedBy: {
    type: String,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

userSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Prevent stale cached model from dropping newer fields.
if (mongoose.models.User) {
  delete mongoose.models.User;
}

const User = mongoose.model('User', userSchema);

export default User;
