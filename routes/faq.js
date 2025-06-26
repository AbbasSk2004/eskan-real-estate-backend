const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { supabasePublic: supabase } = require('../config/supabaseClient');

// Public routes - no authentication required
// Get all FAQs
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('faqs')
      .select('*')
      .order('order_number', { ascending: true });

    if (error) throw error;

    res.json({
      success: true,
      data
    });
  } catch (error) {
    logger.error('Error fetching FAQs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch FAQs',
      error: error.message
    });
  }
});

// Get featured FAQs
router.get('/featured', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('faqs')
      .select('*')
      .eq('is_featured', true)
      .order('order_number', { ascending: true });

    if (error) throw error;

    res.json({
      success: true,
      data
    });
  } catch (error) {
    logger.error('Error fetching featured FAQs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch featured FAQs',
      error: error.message
    });
  }
});

// Get FAQs by category
router.get('/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const { data, error } = await supabase
      .from('faqs')
      .select('*')
      .eq('category', category)
      .order('order_number', { ascending: true });

    if (error) throw error;

    res.json({
      success: true,
      data
    });
  } catch (error) {
    logger.error('Error fetching FAQs by category:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch FAQs by category',
      error: error.message
    });
  }
});

// Create new FAQ (public route with author verification)
router.post('/', async (req, res) => {
  try {
    const { question, answer, category, is_featured = false, author_id } = req.body;

    // Validate required fields
    if (!question || !answer || !author_id) {
      return res.status(400).json({
        success: false,
        message: 'Question, answer, and author_id are required'
      });
    }

    // Get the highest order number
    const { data: maxOrder } = await supabase
      .from('faqs')
      .select('order_number')
      .order('order_number', { ascending: false })
      .limit(1)
      .single();

    const newOrderNumber = (maxOrder?.order_number || 0) + 1;

    const { data, error } = await supabase
      .from('faqs')
      .insert([{
        question,
        answer,
        category,
        is_featured,
        order_number: newOrderNumber,
        author_id
      }])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      data
    });
  } catch (error) {
    logger.error('Error creating FAQ:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create FAQ',
      error: error.message
    });
  }
});

// Update FAQ (public route with author verification)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { question, answer, category, is_featured, order_number, author_id } = req.body;

    if (!author_id) {
      return res.status(400).json({
        success: false,
        message: 'Author ID is required'
      });
    }

    // Verify author ownership
    const { data: existingFaq, error: checkError } = await supabase
      .from('faqs')
      .select('author_id')
      .eq('id', id)
      .single();

    if (checkError || !existingFaq) {
      return res.status(404).json({
        success: false,
        message: 'FAQ not found'
      });
    }

    if (existingFaq.author_id !== author_id) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to update this FAQ'
      });
    }

    const { data, error } = await supabase
      .from('faqs')
      .update({
        question,
        answer,
        category,
        is_featured,
        order_number,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      data
    });
  } catch (error) {
    logger.error('Error updating FAQ:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update FAQ',
      error: error.message
    });
  }
});

// Delete FAQ (public route with author verification)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { author_id } = req.body;

    if (!author_id) {
      return res.status(400).json({
        success: false,
        message: 'Author ID is required'
      });
    }

    // Verify author ownership
    const { data: existingFaq, error: checkError } = await supabase
      .from('faqs')
      .select('author_id')
      .eq('id', id)
      .single();

    if (checkError || !existingFaq) {
      return res.status(404).json({
        success: false,
        message: 'FAQ not found'
      });
    }

    if (existingFaq.author_id !== author_id) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to delete this FAQ'
      });
    }

    const { error } = await supabase
      .from('faqs')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({
      success: true,
      message: 'FAQ deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting FAQ:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete FAQ',
      error: error.message
    });
  }
});

module.exports = router;