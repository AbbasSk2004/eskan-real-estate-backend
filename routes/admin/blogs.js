const express = require('express');
const router = express.Router();
const blogController = require('../../controllers/blog.controller');
const { requireAuth, requireRole } = require('../../middleware/auth');

const requireAdmin = requireRole('admin');

// Public endpoints
router.get('/recent', blogController.getRecentBlogs);
router.get('/featured', blogController.getRecentBlogs);
router.get('/', blogController.getBlogs);
router.get('/:slug', blogController.getBlogBySlug);

// Admin endpoints
router.post('/', requireAuth, requireAdmin, blogController.createBlog);
router.put('/:id', requireAuth, requireAdmin, blogController.updateBlog);
router.delete('/:id', requireAuth, requireAdmin, blogController.deleteBlog);

module.exports = router;
