const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../../middleware/auth');
const inquiriesController = require('../../controllers/admin/propertyInquiries.controller');

const requireAdmin = requireRole('admin');
router.use(requireAuth);
router.use(requireAdmin);

router.get('/', inquiriesController.listInquiries);
router.patch('/:id/status', inquiriesController.updateStatus);
router.delete('/:id', inquiriesController.deleteInquiry);
router.post('/:id/reply', inquiriesController.replyInquiry);

module.exports = router;
