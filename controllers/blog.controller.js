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

const getAllBlogsAdmin = async (req, res) => {
  try {
    const blogs = await blogService.getAllBlogsAdmin();
    res.json({ success: true, data: blogs });
  } catch (err) {
    console.error('Error fetching admin blogs', err);
    res.status(500).json({ success: false, message: 'Failed to fetch blogs' });
  }
};

const getBlogById = async (req, res) => {
  try {
    const blog = await blogService.getBlogById(req.params.id);
    if (!blog) {
      return res.status(404).json({ success: false, message: 'Blog not found' });
    }
    res.json({ success: true, data: blog });
  } catch (err) {
    console.error('Error fetching blog by id', err);
    res.status(500).json({ success: false, message: 'Failed to fetch blog' });
  }
};

const uploadBlogImage = async (req, res) => {
  try {
    const imageUrl = await blogService.uploadBlogImage(req.file);
    res.json({ success: true, imageUrl });
  } catch (err) {
    console.error('Error uploading blog image', err);
    res.status(err.code === 'NO_FILE' ? 400 : 500).json({
      success: false,
      message: err.message || 'Failed to upload blog image'
    });
  }
};

const deleteBlogImage = async (req, res) => {
  try {
    await blogService.deleteBlogImage(req.params.filename);
    res.json({ success: true, message: 'Blog image deleted successfully' });
  } catch (err) {
    console.error('Error deleting blog image', err);
    res.status(500).json({ success: false, message: 'Failed to delete blog image' });
  }
};

module.exports = {
  getRecentBlogs,
  getBlogs,
  getBlogBySlug,
  getBlogById,
  getAllBlogsAdmin,
  createBlog,
  updateBlog,
  deleteBlog,
  uploadBlogImage,
  deleteBlogImage
};
