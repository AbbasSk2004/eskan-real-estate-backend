const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middleware/auth');
const propertyViewsController = require('../controllers/propertyViews.controller');

// Record a view for a property (public endpoint)
router.post('/:id', optionalAuth, propertyViewsController.recordPropertyView);

// Get view count for a specific property
router.get('/:id/count', propertyViewsController.getViewCount);

// Get total views for authenticated user
router.get('/user/total', optionalAuth, propertyViewsController.getUserTotalViews);

module.exports = router;
