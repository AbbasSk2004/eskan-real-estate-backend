const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const testimonialSchema = new mongoose.Schema({
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
  content: { type: String, required: true },
  rating: { type: Number, min: 1, max: 5, required: true },
  approved: { type: Boolean, default: false }
}, {
  timestamps: true
});

module.exports = mongoose.model('Testimonial', testimonialSchema);
