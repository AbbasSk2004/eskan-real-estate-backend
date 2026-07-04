const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../../middleware/auth');
const analyticsController = require('../../controllers/admin/analytics.controller');

const requireAdmin = requireRole('admin');
router.use(requireAuth);
router.use(requireAdmin);

router.get('/overview', analyticsController.overview);
router.get('/property-views', analyticsController.propertyViewsByMonth);
router.get('/property-listings', analyticsController.propertyListingsByMonth);
router.get('/property-types', analyticsController.propertyTypesDistribution);
router.get('/top-performing', analyticsController.topPerformingProperties);

module.exports = router;
