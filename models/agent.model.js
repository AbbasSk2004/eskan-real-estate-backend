const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const agentSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: () => uuidv4(),
    immutable: true
  },
  userId: {
    type: String,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  specialty: { type: String, required: true },
  experience: { type: String, required: true },
  aboutMe: { type: String, required: true },
  cvUrl: { type: String },
  cvPublicId: { type: String },
  social: {
    facebook: String,
    twitter: String,
    instagram: String
  },
  phone: { type: String },
  languages: [{ type: String }],
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  approved: { type: Boolean, default: false },
  approvedAt: { type: Date },
  image: {
    url: String,
    publicId: String
  },
  isFeatured: { type: Boolean, default: false }
}, {
  timestamps: true
});

agentSchema.index({ status: 1 });
agentSchema.index({ approved: 1 });
agentSchema.index({ isFeatured: 1 });

module.exports = mongoose.model('Agent', agentSchema);
