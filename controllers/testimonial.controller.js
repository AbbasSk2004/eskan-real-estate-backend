const testimonialService = require('../services/testimonial.service');

const getApprovedTestimonials = async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 6;
    const testimonials = await testimonialService.getApprovedTestimonials(limit);
    res.json({ success: true, data: testimonials });
  } catch (err) {
    console.error('Error fetching testimonials', err);
    res.status(500).json({ success: false, message: 'Failed to fetch testimonials' });
  }
};

/**
 * GET /api/testimonials/check
 * Requires auth. Returns whether the current user has already submitted a testimonial.
 */
const checkUserTestimonial = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const result = await testimonialService.checkUserTestimonial(userId);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Error checking user testimonial', err);
    res.status(500).json({ success: false, message: 'Failed to check testimonial status' });
  }
};

/**
 * POST /api/testimonials
 * Requires auth. Creates a testimonial for the current user.
 */
const createTestimonial = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { content, rating } = req.body;

    if (!content || !rating) {
      return res.status(400).json({ success: false, message: 'Content and rating are required' });
    }

    const ratingNum = Number(rating);
    if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
    }

    const testimonial = await testimonialService.createTestimonial(userId, content, ratingNum);
    res.status(201).json({ success: true, data: testimonial });
  } catch (err) {
    // Handle duplicate testimonial (MongoDB unique index violation)
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'You have already submitted a testimonial' });
    }
    console.error('Error creating testimonial', err);
    res.status(500).json({ success: false, message: 'Failed to create testimonial' });
  }
};

module.exports = {
  getApprovedTestimonials,
  checkUserTestimonial,
  createTestimonial
};
