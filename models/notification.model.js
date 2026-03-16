const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const notificationSchema = new mongoose.Schema({
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
  type: { type: String, required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
  read: { type: Boolean, default: false, index: true }
}, {
  timestamps: true
});

module.exports = mongoose.model('Notification', notificationSchema);
