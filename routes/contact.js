const express = require('express');
const router = express.Router();
const contactController = require('../controllers/contact.controller');

// Public contact submission endpoint
router.post('/', contactController.createContact);

// Optional admin endpoints (unprotected)
router.get('/', contactController.getAllContacts);
router.get('/:id', contactController.getContact);
router.patch('/:id/status', contactController.updateStatus);

module.exports = router;
