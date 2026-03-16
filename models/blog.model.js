const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const blogSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: () => uuidv4(),
    immutable: true
  },
  title: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, trim: true },
  content: { type: String, required: true },
  image: {
    url: String,
    publicId: String
  },
  excerpt: { type: String },
  category: { type: String },
  tags: [{ type: String }],
  status: { type: String, default: 'published' }
}, {
  timestamps: true
});

blogSchema.index({ slug: 1 }, { unique: true });
blogSchema.index({ status: 1 });

module.exports = mongoose.model('Blog', blogSchema);
