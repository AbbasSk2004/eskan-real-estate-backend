const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const contactSubmissionSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: () => uuidv4(),
    immutable: true
  },
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String },
  message: { type: String, required: true },
  preferredContact: { type: String },
  status: { type: String, default: 'pending' }
}, {
  timestamps: true
});

contactSubmissionSchema.index({ createdAt: 1 });

module.exports = mongoose.model('ContactSubmission', contactSubmissionSchema);
