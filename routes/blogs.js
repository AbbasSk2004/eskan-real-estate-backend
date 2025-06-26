const express = require('express');
const router = express.Router();
const { supabasePublic: supabase } = require('../config/supabaseClient');
const slugify = require('slugify');
const logger = require('../utils/logger');

// Get all published blogs (public route)
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 6, category, tag } = req.query;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('blogs')
      .select(`
        id,
        title,
        slug,
        content,
        excerpt,
        image_url,
        category,
        tags,
        status,
        created_at
      `, { count: 'exact' })
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (category) {
      query = query.eq('category', category);
    }

    if (tag) {
      query = query.contains('tags', [tag]);
    }

    const { data: blogs, count, error } = await query;

    if (error) {
      logger.error('Error fetching blogs:', error);
      throw error;
    }

    // Transform data to include author name and formatted content
    const formattedBlogs = blogs?.map(blog => ({
      ...blog,
      excerpt: blog.excerpt || (blog.content && blog.content.substring(0, 150) + '...')
    })) || [];

    res.json({
      success: true,
      data: {
        blogs: formattedBlogs,
        total: count,
        pages: Math.ceil(count / limit),
        currentPage: parseInt(page)
      }
    });
  } catch (error) {
    logger.error('Error in GET /blogs:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch blogs'
    });
  }
});

// Get recent blogs (public route)
router.get('/recent', async (req, res) => {
  try {
    const { data: blogs, error } = await supabase
      .from('blogs')
      .select(`
        id,
        title,
        slug,
        excerpt,
        content,
        image_url,
        category,
        tags,
        created_at
      `)
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(3);

    if (error) {
      logger.error('Error fetching recent blogs:', error);
      throw error;
    }

    return res.json({
      success: true,
      data: blogs
    });
  } catch (error) {
    logger.error('Error in GET /blogs/recent:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch recent blogs'
    });
  }
});

// Get user's blogs (public route with user_id parameter)
router.get('/user/:userId/blogs', async (req, res) => {
  // This route is currently disabled because the blogs table does not store author information
  // Return empty list to avoid errors
  return res.json({ success: true, data: [] });
});

// Get single blog by slug (public route)
router.get('/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const { data: blog, error } = await supabase
      .from('blogs')
      .select(`
        id,
        title,
        slug,
        content,
        excerpt,
        image_url,
        category,
        tags,
        status,
        created_at
      `)
      .eq('slug', slug)
      .single();

    if (error) {
      logger.error('Error fetching blog:', error);
      throw error;
    }

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog not found'
      });
    }

    if (blog.status !== 'published') {
      return res.status(403).json({
        success: false,
        message: 'This blog post is not published'
      });
    }

    return res.json({
      success: true,
      data: blog
    });
  } catch (error) {
    logger.error('Error in GET /blogs/:slug:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch blog'
    });
  }
});

// Create new blog (public route)
router.post('/', async (req, res) => {
  try {
    const { title, content, image_url, category, tags, excerpt, status = 'draft' } = req.body;

    if (!title || !content) {
      return res.status(400).json({
        success: false,
        message: 'Title and content are required'
      });
    }

    const slug = slugify(title, { lower: true, strict: true });

    const { data: blog, error } = await supabase
      .from('blogs')
      .insert({
        title,
        slug,
        content,
        image_url,
        category,
        tags,
        excerpt,
        status
      })
      .select()
      .single();

    if (error) {
      logger.error('Error creating blog:', error);
      throw error;
    }

    return res.status(201).json({
      success: true,
      data: blog
    });
  } catch (error) {
    logger.error('Error in POST /blogs:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to create blog'
    });
  }
});

// Update blog (public route)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, image_url, category, tags, excerpt, status } = req.body;

    // Check if blog exists
    const { data: existingBlog, error: checkError } = await supabase
      .from('blogs')
      .select('id')
      .eq('id', id)
      .single();

    if (checkError || !existingBlog) {
      return res.status(404).json({
        success: false,
        message: 'Blog not found'
      });
    }

    const updates = {
      ...(title && { title, slug: slugify(title, { lower: true, strict: true }) }),
      ...(content && { content }),
      ...(image_url && { image_url }),
      ...(category && { category }),
      ...(tags && { tags }),
      ...(excerpt && { excerpt }),
      ...(status && { status }),
    };

    const { data: blog, error } = await supabase
      .from('blogs')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Error updating blog:', error);
      throw error;
    }

    return res.json({
      success: true,
      data: blog
    });
  } catch (error) {
    logger.error('Error in PUT /blogs/:id:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to update blog'
    });
  }
});

// Delete blog (public route)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if blog exists
    const { data: existingBlog, error: checkError } = await supabase
      .from('blogs')
      .select('id')
      .eq('id', id)
      .single();

    if (checkError || !existingBlog) {
      return res.status(404).json({
        success: false,
        message: 'Blog not found'
      });
    }

    const { error } = await supabase
      .from('blogs')
      .delete()
      .eq('id', id);

    if (error) {
      logger.error('Error deleting blog:', error);
      throw error;
    }

    res.json({
      success: true,
      message: 'Blog deleted successfully'
    });
  } catch (error) {
    logger.error('Error in DELETE /blogs/:id:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete blog'
    });
  }
});

module.exports = router; 