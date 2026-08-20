const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { slugifyTitle } = require('../utils/slugify');

const propertySchema = new mongoose.Schema({
  _id: {
    type: String,
    default: () => uuidv4(),
    immutable: true
  },
  title: { type: String, required: true, trim: true },
  slug: { type: String, trim: true, lowercase: true },
  description: { type: String, default: '' },
  propertyType: { type: String, trim: true },
  status: { type: String, default: 'available', trim: true },
  price: { type: Number, required: true },
  bedrooms: { type: Number },
  bathrooms: { type: Number },
  area: { type: Number },
  address: { type: String, trim: true },
  city: { type: String, trim: true },
  governorate: { type: String, trim: true },
  village: { type: String, trim: true },
  features: { type: mongoose.Schema.Types.Mixed, default: {} },
  mainImage: mongoose.Schema.Types.Mixed,
  images: mongoose.Schema.Types.Mixed,
  ownerId: {
    type: String,
    ref: 'User',
    required: true,
    index: true
  },
  livingRooms: { type: Number },
  // `floor` = which floor the unit is on (Apartment). `floors` = how many
  // floors the building has (Villa / Building). Two different facts — they
  // previously shared the single `floor` column, so entering one overwrote
  // the other, and `floors` was dropped entirely by strict-mode schema.
  floor: { type: Number },
  floors: { type: Number },
  yearBuilt: { type: Number },
  gardenArea: { type: Number },
  parkingSpaces: { type: Number },
  furnishingStatus: { type: String },
  shopFrontWidth: { type: Number },
  storageArea: { type: Number },
  landType: { type: String },
  zoning: { type: String },
  meetingRooms: { type: Number },
  officeLayout: { type: String },
  units: { type: Number },
  elevators: { type: Number },
  plotSize: { type: Number },
  ceilingHeight: { type: Number },
  loadingDocks: { type: Number },
  farmArea: { type: Number },
  waterSource: { type: String },
  cropTypes: { type: String },
  view: { type: String },
  isFeatured: { type: Boolean, default: false },
  verified: { type: Boolean, default: false },
  recommended: { type: Boolean, default: false },

  // --- AI enrichment -------------------------------------------------------
  // Written exclusively by services/ai.service.js (write-time, off the request
  // path). Client payloads are stripped of these keys in property.service.js —
  // an owner must not be able to hand-write their own ranking features.
  aiTags: { type: [String], default: undefined },
  aiLifestyle: {
    family: { type: Number },
    investor: { type: Number },
    student: { type: Number },
    luxury: { type: Number }
  },
  aiSummary: {
    en: { type: String },
    ar: { type: String }
  },
  aiModel: { type: String },
  aiEnrichedAt: { type: Date },
  // Hash of the title+description the enrichment was derived from, so editing
  // a price or swapping photos does not re-spend tokens.
  aiDescriptionHash: { type: String }
}, {
  timestamps: true
});

// Auto-generate a guaranteed-unique slug from the title whenever the slug is
// not explicitly provided (covers creation, title edits, and backfills).
// Collisions resolve deterministically: "modern-apartment", "modern-apartment-2", …
propertySchema.pre('validate', async function ensureUniqueSlug(next) {
  if (!this.isModified('slug')) {
    const base = slugifyTitle(this.title || 'property');
    let candidate = base;
    let suffix = 2;
    // eslint-disable-next-line no-await-in-loop
    while ((await this.constructor.countDocuments({ slug: candidate, _id: { $ne: this._id } })) > 0) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    this.slug = candidate;
  }
  next();
});

propertySchema.index({ status: 1 });
propertySchema.index({ propertyType: 1 });
propertySchema.index({ price: 1 });
propertySchema.index({ area: 1 });
propertySchema.index({ city: 1, governorate: 1 });
propertySchema.index({ isFeatured: 1 });
propertySchema.index({ slug: 1 }, { unique: true, sparse: true });
// Supports future tag-based filtering and keeps the recommender's aiTags reads
// index-backed rather than a collection scan.
propertySchema.index({ aiTags: 1 });

module.exports = mongoose.model('Property', propertySchema);
