const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../../middleware/auth');
const testimonialsController = require('../../controllers/admin/testimonials.controller');

const requireAdmin = requireRole('admin');
router.use(requireAuth);
router.use(requireAdmin);

router.get('/', testimonialsController.listTestimonials);
router.patch('/:id/approve', testimonialsController.setApproval);
router.delete('/:id', testimonialsController.removeTestimonial);

module.exports = router;
