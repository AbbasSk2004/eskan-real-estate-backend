const favoriteService = require('../services/favorite.service');

const getUserFavorites = async (req, res) => {
  try {
    const userId = req.user?._id;
    const favorites = await favoriteService.listFavorites(userId);
    return res.json({ success: true, data: favorites });
  } catch (err) {
    console.error('Error fetching favorites', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch favorites' });
  }
};

const getFavoriteStatus = async (req, res) => {
  try {
    const userId = req.user?._id;
    const propertyId = req.params.propertyId || req.params.id;
    if (!propertyId) {
      return res.status(400).json({ success: false, message: 'Property ID is required' });
    }

    const isFavorite = await favoriteService.isFavorited(userId, propertyId);
    return res.json({
      success: true,
      data: {
        propertyId,
        isFavorite,
        isFavorited: isFavorite
      }
    });
  } catch (err) {
    console.error('Error checking favorite status', err);
    return res.status(500).json({ success: false, message: 'Failed to check favorite status' });
  }
};

const addFavorite = async (req, res) => {
  try {
    const userId = req.user?._id;
    const propertyId = req.params.propertyId || req.params.id;

    if (!propertyId) {
      return res.status(400).json({ success: false, message: 'Property ID is required' });
    }

    await favoriteService.addFavorite(userId, propertyId);
    return res.json({ success: true, data: { propertyId, isFavorite: true, isFavorited: true } });
  } catch (err) {
    console.error('Error adding favorite', err);
    return res.status(500).json({ success: false, message: 'Failed to add favorite' });
  }
};

const removeFavorite = async (req, res) => {
  try {
    const userId = req.user?._id;
    const propertyId = req.params.propertyId || req.params.id;

    if (!propertyId) {
      return res.status(400).json({ success: false, message: 'Property ID is required' });
    }

    await favoriteService.removeFavorite(userId, propertyId);
    return res.json({ success: true, data: { propertyId, isFavorite: false, isFavorited: false } });
  } catch (err) {
    console.error('Error removing favorite', err);
    return res.status(500).json({ success: false, message: 'Failed to remove favorite' });
  }
};

module.exports = {
  getUserFavorites,
  getFavoriteStatus,
  addFavorite,
  removeFavorite
};
