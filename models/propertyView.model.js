const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const propertyViewSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: () => uuidv4(),
    immutable: true
  },
  propertyId: {
    type: String,
    ref: 'Property',
    required: true,
    index: true
  },
  userId: {
    type: String,
    ref: 'User',
    index: true
  },
  // Anonymous visitor cookie id. Present for guests (and for signed-in users
  // browsing from a device that already had the cookie), absent for clients
  // that cannot hold cookies (native mobile app), which fall back to ipAddress.
  visitorId: {
    type: String
  },
  ipAddress: { type: String, required: true },
  viewedAt: { type: Date, default: Date.now, index: true },
  viewedDate: { type: Date, default: () => new Date().setHours(0, 0, 0, 0), index: true }
}, {
  timestamps: false
});

// One row per (property, visitor, day). This is the dedup guarantee that keeps
// a single guest refreshing a listing from dominating the popularity signal
// that recommendations rank on.
//
// `partialFilterExpression` rather than `sparse`: a compound *sparse* index
// still indexes documents that have only some of the keys, so every row
// lacking visitorId would collide on the same null key.
propertyViewSchema.index(
  { propertyId: 1, visitorId: 1, viewedDate: 1 },
  { unique: true, partialFilterExpression: { visitorId: { $type: 'string' } } }
);

// Fallback dedup lookup for cookie-less clients (keyed on ipAddress instead).
propertyViewSchema.index({ propertyId: 1, ipAddress: 1, viewedDate: 1 }, { unique: false });

// Taste-profile reads: "most recent views for this identity", newest first.
propertyViewSchema.index({ userId: 1, viewedAt: -1 });
propertyViewSchema.index({ visitorId: 1, viewedAt: -1 });

module.exports = mongoose.model('PropertyView', propertyViewSchema);
