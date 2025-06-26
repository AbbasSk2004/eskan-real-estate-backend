const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { supabase } = require('../config/supabaseClient');

// Contact form submission endpoint
router.post('/', async (req, res) => {
  try {
    const { name, email, phone, message, preferred_contact } = req.body;

    // Enhanced validation
    if (!name || !email || !message || !preferred_contact) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, message, and preferred contact method are required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    // Validate phone if provided (including Lebanese format)
    if (phone) {
      // Accepting both international format and Lebanese format
      const phoneRegex = /^(\+?[0-9]{1,4})?[\s-]?(\d{1,4})[\s-]?(\d{6,7})$/;
      if (!phoneRegex.test(phone)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid phone number format'
        });
      }
    }

    // Log the submission
    logger.info('Contact form submission:', {
      name,
      email,
      phone,
      preferred_contact,
      message: message.substring(0, 100) + (message.length > 100 ? '...' : '') // Log truncated message
    });

    // Insert submission into the contact_submissions table
    const { data, error } = await supabase
      .from('contact_submissions')
      .insert([
        { 
          name, 
          email, 
          phone, 
          message, 
          preferred_contact,
          status: 'pending'
        }
      ]);

    if (error) {
      logger.error('Database error when saving contact submission:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to save your message to our system',
        error: error.message
      });
    }

    // Success response
    res.status(201).json({
      success: true,
      message: 'Thank you for your message. We will get back to you soon!',
      data: {
        name,
        email,
        phone,
        preferred_contact,
        submitted_at: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Contact form error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit contact form',
      error: error.message
    });
  }
});

module.exports = router;
