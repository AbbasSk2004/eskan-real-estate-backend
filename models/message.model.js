const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const messageSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: () => uuidv4(),
    immutable: true
  },
  conversationId: {
    type: String,
    ref: 'Conversation',
    required: true,
    index: true
  },
  senderId: {
    type: String,
    ref: 'User',
    required: true,
    index: true
  },
  content: { type: String, required: true },
  read: { type: Boolean, default: false, index: true },
  messageType: { type: String, default: 'text' },
  file: {
    url: String,
    publicId: String,
    mimeType: String
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Message', messageSchema);
