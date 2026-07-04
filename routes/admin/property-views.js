const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../../middleware/auth');
const propertyViewsController = require('../../controllers/propertyViews.controller');

const requireAdmin = requireRole('admin');
router.use(requireAuth);
router.use(requireAdmin);

router.post('/:id', propertyViewsController.recordPropertyView);
router.get('/:id', propertyViewsController.getViewCount);

module.exports = router;
