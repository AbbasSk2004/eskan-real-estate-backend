const express = require('express');
const router = express.Router();
const propertyController = require('../controllers/property.controller');

/**
 * Type page listing.
 * Supports the same query parameters as /api/properties but scoped to a property type.
 * This is used by the frontend type pages (e.g. Chalet, Farm).
 */
router.get('/:type', (req, res) => {
  // Enforce propertyType based on the URL so clients can omit it.
  req.query = {
    ...req.query,
    propertyType: req.params.type
  };
  return propertyController.listProperties(req, res);
});

module.exports = router;
