const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../../middleware/auth');
const contactController = require('../../controllers/contact.controller');

const requireAdmin = requireRole('admin');
router.use(requireAuth);
router.use(requireAdmin);

router.get('/', contactController.getAllContacts);
router.get('/:id', contactController.getContact);
router.patch('/:id/status', contactController.updateStatus);

module.exports = router;
