const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const blogController = require('../controllers/blog.controller');

// Public blog endpoints
router.get('/recent', blogController.getRecentBlogs);
router.get('/featured', blogController.getRecentBlogs); // Alias for featured blogs
router.get('/', blogController.getBlogs);
router.get('/:slug', blogController.getBlogBySlug);

// Protected endpoints (admin users should call these)
router.post('/', requireAuth, blogController.createBlog);
router.put('/:id', requireAuth, blogController.updateBlog);
router.delete('/:id', requireAuth, blogController.deleteBlog);

module.exports = router;
