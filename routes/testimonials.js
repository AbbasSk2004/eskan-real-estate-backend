const express = require('express');
const router = express.Router();
const testimonialController = require('../controllers/testimonial.controller');
const { requireAuth } = require('../middleware/auth');

// Public routes
// GET /api/testimonials          — list approved testimonials
router.get('/', testimonialController.getApprovedTestimonials);
// GET /api/testimonials/featured — alias for approved (used by frontend)
router.get('/featured', testimonialController.getApprovedTestimonials);

// Authenticated routes
// GET  /api/testimonials/check   — check if current user has a testimonial
router.get('/check', requireAuth, testimonialController.checkUserTestimonial);
// POST /api/testimonials         — submit a new testimonial
router.post('/', requireAuth, testimonialController.createTestimonial);

module.exports = router;
