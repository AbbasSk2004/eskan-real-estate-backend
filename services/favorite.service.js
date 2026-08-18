const Favorite = require('../models/favorite.model');
const propertyService = require('./property.service');

const listFavorites = async (userId) => {
  if (!userId) return [];

  // Populate property details so the frontend can render full property cards
  const favorites = await Favorite.find({ userId })
    .sort({ createdAt: -1 })
    .populate('propertyId');

  return favorites
    .map((fav) => fav.propertyId)
    .filter(Boolean)
    .map((property) => propertyService.formatProperty(property));
};

const isFavorited = async (userId, propertyId) => {
  if (!userId || !propertyId) return false;
  const exists = await Favorite.exists({ userId, propertyId });
  return Boolean(exists);
};

const addFavorite = async (userId, propertyId) => {
  if (!userId || !propertyId) return null;
  const existing = await Favorite.findOne({ userId, propertyId });
  if (existing) return existing;

  const favorite = new Favorite({ userId, propertyId });
  await favorite.save();
  return favorite;
};

const removeFavorite = async (userId, propertyId) => {
  if (!userId || !propertyId) return null;
  const removed = await Favorite.findOneAndDelete({ userId, propertyId });
  return removed;
};

module.exports = {
  listFavorites,
  isFavorited,
  addFavorite,
  removeFavorite
};
