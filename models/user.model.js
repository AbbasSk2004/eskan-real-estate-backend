const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const roles = ['user', 'agent', 'admin'];
const statuses = ['active', 'inactive', 'banned'];

const userSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: () => uuidv4(),
    immutable: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  passwordHash: {
    type: String
  },
  // Refresh tokens are stored hashed for security. Used for token rotation / logout.
  refreshTokens: [
    {
      hash: String,
      expiresAt: Date
    }
  ],
  firstName: {
    type: String,
    trim: true
  },
  lastName: {
    type: String,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  profilePhoto: {
    url: { type: String },
    publicId: { type: String }
  },
  role: {
    type: String,
    enum: roles,
    default: 'user'
  },
  status: {
    type: String,
    enum: statuses,
    default: 'active'
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  lastLoginAt: {
    type: Date
  },
  // Token for email verification / password reset
  emailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: String,
  passwordResetToken: String,
  passwordResetExpires: Date
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ role: 1 });
userSchema.index({ status: 1 });

module.exports = mongoose.model('User', userSchema);
