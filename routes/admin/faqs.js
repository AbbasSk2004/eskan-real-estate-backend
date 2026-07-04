const express = require('express');
const router = express.Router();
const faqController = require('../../controllers/faq.controller');
const { requireAuth, requireRole } = require('../../middleware/auth');

const requireAdmin = requireRole('admin');

// Public endpoints
router.get('/', faqController.getAllFaqs);
router.get('/featured', faqController.getFeaturedFaqs);
router.get('/category/:category', faqController.getFaqsByCategory);

// Admin-only endpoints
router.post('/', requireAuth, requireAdmin, faqController.createFaq);
router.put('/:id', requireAuth, requireAdmin, faqController.updateFaq);
router.delete('/:id', requireAuth, requireAdmin, faqController.deleteFaq);

module.exports = router;
