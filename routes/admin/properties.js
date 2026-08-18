const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../../middleware/auth');
const propertyController = require('../../controllers/property.controller');

const requireAdmin = requireRole('admin');

router.use(requireAuth);
router.use(requireAdmin);

router.get('/', propertyController.listProperties);
router.get('/:id', propertyController.getProperty);
router.post('/', propertyController.handleUpload, propertyController.createProperty);
router.put('/:id', propertyController.handleUpload, propertyController.updateProperty);
router.delete('/:id', propertyController.deleteProperty);

module.exports = router;
