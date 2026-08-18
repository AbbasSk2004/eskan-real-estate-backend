const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const contactSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: () => uuidv4(),
    immutable: true
  },
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  phone: { type: String, trim: true, default: '' },
  message: { type: String, required: true, trim: true },
  preferredContact: {
    type: String,
    trim: true,
    enum: ['email', 'sms', 'whatsapp', 'phone'],
    default: 'email'
  },
  status: {
    type: String,
    trim: true,
    default: 'in_progress',
    enum: ['in_progress', 'closed', 'resolved', 'follow_up']
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Contact', contactSchema);
