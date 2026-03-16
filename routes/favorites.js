const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const favoriteController = require('../controllers/favorite.controller');

// All favorite endpoints require authentication
router.use(requireAuth);

// Get current user's favorite property list
router.get('/user', favoriteController.getUserFavorites);

// Check if a property is favorited
router.get('/check/:propertyId', favoriteController.getFavoriteStatus);
router.get('/:propertyId/status', favoriteController.getFavoriteStatus);

// Add or remove favorite
router.post('/:propertyId', favoriteController.addFavorite);
router.delete('/:propertyId', favoriteController.removeFavorite);

module.exports = router;
