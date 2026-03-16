const express = require('express');
const router = express.Router();
const faqController = require('../controllers/faq.controller');
const { requireAuth } = require('../middleware/auth');

// Public FAQ endpoints
router.get('/', faqController.getAllFaqs);
router.get('/featured', faqController.getFeaturedFaqs);
router.get('/category/:category', faqController.getFaqsByCategory);

// Protected endpoints (requires authentication)
router.post('/', requireAuth, faqController.createFaq);
router.put('/:id', requireAuth, faqController.updateFaq);
router.delete('/:id', requireAuth, faqController.deleteFaq);

module.exports = router;
