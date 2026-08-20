const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const roles = ['user', 'agent', 'admin'];
// `status` is PRESENCE ONLY: 'active' = online, 'inactive' = offline.
// It is deliberately not account moderation — nothing in this app disables
// accounts, and no login/middleware check reads this field.
const statuses = ['active', 'inactive'];

// A row can be stranded at 'active' when a process dies before the socket close
// handler runs (deploy, restart, hard crash). Presence is therefore only
// trusted while `lastSeenAt` is fresh; past this window the user is offline.
const PRESENCE_STALE_MS = 5 * 60 * 1000;

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
  // Last moment presence was observed for this user — written by the WebSocket
  // connect/close handlers, the periodic refresh sweep, and the beacon
  // fallback. Pairs with `status` so a stale 'active' can be detected.
  lastSeenAt: {
    type: Date
  },
  // Token for email verification / password reset
  emailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: String,
  emailVerificationTokenExpires: Date,
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
userSchema.index({ lastSeenAt: -1 });

// Single source of truth for "is this user online right now". Every reader
// (admin list, dashboard count, profile payload) must agree, so the freshness
// rule lives here rather than being re-implemented per call site.
userSchema.virtual('isOnline').get(function () {
  if (this.status !== 'active' || !this.lastSeenAt) return false;
  return Date.now() - new Date(this.lastSeenAt).getTime() < PRESENCE_STALE_MS;
});

const User = mongoose.model('User', userSchema);

// Exposed on the model so query-level callers can build the same freshness
// window without a second copy of the constant. `module.exports` stays the
// model itself so every existing `require('.../user.model')` keeps working.
User.PRESENCE_STALE_MS = PRESENCE_STALE_MS;

module.exports = User;
