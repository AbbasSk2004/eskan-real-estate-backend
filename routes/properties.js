const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const propertyController = require('../controllers/property.controller');

// Public endpoints
router.get('/featured', propertyController.getFeaturedProperties);
router.get('/recommended', propertyController.getRecommendedProperties);
router.get('/', propertyController.listProperties);

// Authenticated user endpoints
router.get('/user/properties', requireAuth, propertyController.getUserProperties);
router.get('/:id', propertyController.getProperty);
router.post('/:id/views', requireAuth, propertyController.recordPropertyView);
router.post('/:id/favorites', requireAuth, propertyController.addFavorite);
router.post('/', requireAuth, propertyController.handleUpload, propertyController.createProperty);
router.delete('/:id', requireAuth, propertyController.deleteProperty);

module.exports = router;
