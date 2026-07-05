const express = require('express');
const multer = require('multer');
const router = express.Router();
const blogController = require('../../controllers/blog.controller');
const { requireAuth, requireRole } = require('../../middleware/auth');

const requireAdmin = requireRole('admin');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

// Public endpoints
router.get('/recent', blogController.getRecentBlogs);
router.get('/featured', blogController.getRecentBlogs);
router.get('/', blogController.getAllBlogsAdmin);

// Admin-only utility routes (must come before /:id)
router.post(
  '/upload-image',
  requireAuth,
  requireAdmin,
  upload.single('blog_image'),
  blogController.uploadBlogImage
);
router.delete(
  '/delete-image/:filename',
  requireAuth,
  requireAdmin,
  blogController.deleteBlogImage
);

router.get('/:id', blogController.getBlogById);
router.post('/', requireAuth, requireAdmin, blogController.createBlog);
router.put('/:id', requireAuth, requireAdmin, blogController.updateBlog);
router.delete('/:id', requireAuth, requireAdmin, blogController.deleteBlog);

module.exports = router;
