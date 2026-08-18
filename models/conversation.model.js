const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const conversationSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: () => uuidv4(),
    immutable: true
  },
  participant1Id: {
    type: String,
    ref: 'User',
    required: true,
    index: true
  },
  participant2Id: {
    type: String,
    ref: 'User',
    required: true,
    index: true
  },
  propertyId: {
    type: String,
    ref: 'Property'
  },
  lastMessage: {
    content: String,
    senderId: String,
    createdAt: Date,
    messageType: String
  }
}, {
  timestamps: true
});

conversationSchema.index({ participant1Id: 1, participant2Id: 1 }, { unique: true });

module.exports = mongoose.model('Conversation', conversationSchema);
