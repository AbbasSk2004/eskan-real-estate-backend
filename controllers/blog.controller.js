const blogService = require('../services/blog.service');

const getRecentBlogs = async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 5;
    const blogs = await blogService.getRecentBlogs(limit);
    res.json({ success: true, data: blogs });
  } catch (err) {
    console.error('Error fetching recent blogs', err);
    res.status(500).json({ success: false, message: 'Failed to fetch recent blogs' });
  }
};

const getBlogs = async (req, res) => {
  try {
    const { page, limit, category, search } = req.query;
    const data = await blogService.listBlogs({ page, limit, category, search });
    res.json({ success: true, data });
  } catch (err) {
    console.error('Error fetching blogs', err);
    res.status(500).json({ success: false, message: 'Failed to fetch blogs' });
  }
};

const getBlogBySlug = async (req, res) => {
  try {
    const slug = req.params.slug;
    const blog = await blogService.getBlogBySlug(slug);
    if (!blog) {
      return res.status(404).json({ success: false, message: 'Blog not found' });
    }
    res.json({ success: true, data: blog });
  } catch (err) {
    console.error('Error fetching blog', err);
    res.status(500).json({ success: false, message: 'Failed to fetch blog' });
  }
};

const createBlog = async (req, res) => {
  try {
    const blog = await blogService.createBlog(req.body);
    res.status(201).json({ success: true, data: blog });
  } catch (err) {
    console.error('Error creating blog', err);
    res.status(500).json({ success: false, message: 'Failed to create blog' });
  }
};

const updateBlog = async (req, res) => {
  try {
    const updated = await blogService.updateBlog(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Blog not found' });
    }
    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('Error updating blog', err);
    res.status(500).json({ success: false, message: 'Failed to update blog' });
  }
};

const deleteBlog = async (req, res) => {
  try {
    const deleted = await blogService.deleteBlog(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Blog not found' });
    }
    res.json({ success: true, message: 'Blog deleted successfully' });
  } catch (err) {
    console.error('Error deleting blog', err);
    res.status(500).json({ success: false, message: 'Failed to delete blog' });
  }
};

module.exports = {
  getRecentBlogs,
  getBlogs,
  getBlogBySlug,
  createBlog,
  updateBlog,
  deleteBlog
};
