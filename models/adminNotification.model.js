const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const adminNotificationSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: () => uuidv4(),
    immutable: true
  },
  adminId: {
    type: String,
    ref: 'User',
    required: true,
    index: true
  },
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String, required: true },
  actionUrl: { type: String },
  read: { type: Boolean, default: false, index: true }
}, {
  timestamps: true
});

module.exports = mongoose.model('AdminNotification', adminNotificationSchema);
