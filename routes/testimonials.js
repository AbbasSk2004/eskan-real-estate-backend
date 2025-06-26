const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { supabase } = require('../config/supabaseClient');

// Helper function to verify session
const verifySession = async (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: 'No token provided' };
  }

  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return { error: 'Invalid token' };
  }

  return { user };
};

// Get all approved testimonials
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('testimonials')
      .select(`
        id,
        content,
        rating,
        created_at,
        profiles:profiles_id (
          firstname,
          lastname,
          email,
          profile_photo
        )
      `)
      .eq('approved', true)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      data: data || []
    });
  } catch (err) {
    logger.error('Error fetching testimonials:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch testimonials'
    });
  }
});

// Submit testimonial
router.post('/', async (req, res) => {
  try {
    // Verify session
    const { user, error: authError } = await verifySession(req);
    if (authError) {
      return res.status(401).json({
        success: false,
        message: 'Please log in to submit a testimonial'
      });
    }

    const { content, rating } = req.body;

    // Validate required fields
    if (!content || !rating) {
      return res.status(400).json({
        success: false,
        message: 'Content and rating are required'
      });
    }

    const { data, error } = await supabase
      .from('testimonials')
      .insert([{
        profiles_id: user.id,
        content,
        rating: parseInt(rating),
        approved: false,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: 'Testimonial submitted successfully',
      data
    });
  } catch (err) {
    logger.error('Error submitting testimonial:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to submit testimonial'
    });
  }
});

// Get user's testimonials
router.get('/user', async (req, res) => {
  try {
    // Verify session
    const { user, error: authError } = await verifySession(req);
    if (authError) {
      return res.status(401).json({
        success: false,
        message: 'Please log in to view your testimonials'
      });
    }

    const { data, error } = await supabase
      .from('testimonials')
      .select(`
        id,
        content,
        rating,
        approved,
        created_at
      `)
      .eq('profiles_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      data: data || []
    });
  } catch (err) {
    logger.error('Error fetching user testimonials:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch your testimonials'
    });
  }
});

// Check if user has submitted a testimonial
router.get('/check', async (req, res) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.json({
        success: true,
        exists: false,
        message: 'No authentication token provided'
      });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.json({
        success: true,
        exists: false,
        message: 'Invalid or expired token'
      });
    }

    const { data, error } = await supabase
      .from('testimonials')
      .select('id')
      .eq('profiles_id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 is the "no rows returned" error
      throw error;
    }

    res.json({
      success: true,
      exists: !!data,
      message: data ? 'User has submitted a testimonial' : 'No testimonial found for user'
    });
  } catch (err) {
    logger.error('Error checking user testimonial:', err);
    res.json({
      success: true,
      exists: false,
      message: 'Error checking testimonial status'
    });
  }
});

module.exports = router; 