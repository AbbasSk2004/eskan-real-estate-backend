const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const propertySchema = new mongoose.Schema({
  _id: {
    type: String,
    default: () => uuidv4(),
    immutable: true
  },
  title: { type: String, required: true, trim: true },
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
  floor: { type: Number },
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
  recommended: { type: Boolean, default: false }
}, {
  timestamps: true
});

propertySchema.index({ status: 1 });
propertySchema.index({ propertyType: 1 });
propertySchema.index({ price: 1 });
propertySchema.index({ area: 1 });
propertySchema.index({ city: 1, governorate: 1 });
propertySchema.index({ isFeatured: 1 });

module.exports = mongoose.model('Property', propertySchema);
