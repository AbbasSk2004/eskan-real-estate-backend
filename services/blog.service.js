const Blog = require('../models/blog.model');

const toResponse = (blogDoc) => {
  const blog = blogDoc.toObject ? blogDoc.toObject({ virtuals: true }) : blogDoc;

  const imageUrl =
    blog.image?.url ||
    blog.image_url ||
    blog.coverImage?.url ||
    blog.cover_image?.url ||
    blog.coverImage ||
    blog.cover_image ||
    '';

  return {
    ...blog,
    // Ensure a stable identifier for frontend usage
    id: blog._id || blog.id,
    // Legacy/dual fields for frontend compatibility
    image_url: imageUrl,
    coverImage: imageUrl,
    cover_image: imageUrl
  };
};

const listBlogs = async ({ page = 1, limit = 10, category, status = 'published', search }) => {
  const filter = {};

  if (status) {
    filter.status = status;
  }

  if (category) {
    filter.category = category;
  }

  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: 'i' } },
      { content: { $regex: search, $options: 'i' } },
      { excerpt: { $regex: search, $options: 'i' } }
    ];
  }

  const totalCount = await Blog.countDocuments(filter);
  const totalPages = Math.max(1, Math.ceil(totalCount / Number(limit)));

  const blogs = await Blog.find(filter)
    .sort({ createdAt: -1 })
    .skip((Number(page) - 1) * Number(limit))
    .limit(Number(limit));

  return {
    blogs: blogs.map(toResponse),
    totalPages,
    currentPage: Number(page),
    totalCount
  };
};

const getRecentBlogs = async (limit = 5) => {
  const blogs = await Blog.find({ status: 'published' })
    .sort({ createdAt: -1 })
    .limit(Number(limit));

  return blogs.map(toResponse);
};

const getBlogBySlug = async (slug) => {
  if (!slug) return null;
  const blog = await Blog.findOne({ slug, status: 'published' });
  return blog ? toResponse(blog) : null;
};

const getBlogById = async (id) => {
  if (!id) return null;
  const blog = await Blog.findById(id);
  return blog ? toResponse(blog) : null;
};

const createBlog = async (payload) => {
  const blog = new Blog(payload);
  await blog.save();
  return toResponse(blog);
};

const updateBlog = async (id, payload) => {
  const blog = await Blog.findByIdAndUpdate(id, payload, { new: true });
  return blog ? toResponse(blog) : null;
};

const deleteBlog = async (id) => {
  const blog = await Blog.findByIdAndDelete(id);
  return blog ? toResponse(blog) : null;
};

module.exports = {
  listBlogs,
  getRecentBlogs,
  getBlogBySlug,
  getBlogById,
  createBlog,
  updateBlog,
  deleteBlog
};
