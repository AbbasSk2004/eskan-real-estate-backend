const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const propertyInquirySchema = new mongoose.Schema({
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
    required: true,
    index: true
  },
  message: { type: String, required: true },
  status: { type: String, default: 'pending', index: true },
  subject: { type: String }
}, {
  timestamps: true
});

module.exports = mongoose.model('PropertyInquiry', propertyInquirySchema);
