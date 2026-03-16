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
  ipAddress: { type: String, required: true },
  viewedAt: { type: Date, default: Date.now, index: true },
  viewedDate: { type: Date, default: () => new Date().setHours(0, 0, 0, 0), index: true }
}, {
  timestamps: false
});

propertyViewSchema.index({ propertyId: 1, ipAddress: 1, viewedDate: 1 }, { unique: false });

module.exports = mongoose.model('PropertyView', propertyViewSchema);
