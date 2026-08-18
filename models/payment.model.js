const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const paymentSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: () => uuidv4(),
    immutable: true
  },
  userId: {
    type: String,
    ref: 'User',
    required: true,
    index: true
  },
  propertyId: {
    type: String,
    ref: 'Property'
  },
  amount: { type: Number, required: true },
  paymentType: { type: String, required: true },
  paymentStatus: { type: String, default: 'completed', required: true },
  cardLastFour: { type: String },
  transactionId: { type: String },
  paymentMethod: { type: String, required: true },
  billingName: { type: String },
  billingEmail: { type: String },
  description: { type: String },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, {
  timestamps: true
});

paymentSchema.index({ userId: 1 });
paymentSchema.index({ propertyId: 1 });
paymentSchema.index({ paymentStatus: 1 });

module.exports = mongoose.model('Payment', paymentSchema);
