const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const faqSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: () => uuidv4(),
    immutable: true
  },
  question: { type: String, required: true },
  answer: { type: String, required: true },
  category: { type: String },
  isFeatured: { type: Boolean, default: false },
  order: { type: Number, default: 0 }
}, {
  timestamps: true
});

faqSchema.index({ isFeatured: 1 });
faqSchema.index({ order: 1 });

module.exports = mongoose.model('Faq', faqSchema);
