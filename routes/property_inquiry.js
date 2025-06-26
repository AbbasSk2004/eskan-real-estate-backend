const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Authentication middleware
const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }

    // Get user profile data
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('profiles_id', user.id)
      .single();

    if (profileError && profileError.code !== 'PGRST116') {
      logger.error('Profile fetch error:', profileError);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch user profile'
      });
    }

    // Attach user and profile to request
    req.user = user;
    req.profile = profile;
    
    next();
  } catch (err) {
    logger.error('Authentication error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to authenticate user'
    });
  }
};

// Get all inquiries for a property
router.get('/property/:propertyId', authenticateUser, async (req, res) => {
  try {
    const { propertyId } = req.params;

    // First check if property exists
    const { data: property, error: propertyError } = await supabase
      .from('properties')
      .select('profiles_id')
      .eq('id', propertyId)
      .single();

    if (propertyError || !property) {
      logger.error('Property not found:', { propertyId, error: propertyError });
      return res.status(404).json({ 
        success: false,
        message: 'Property not found' 
      });
    }

    // Check if user is the property owner
    if (property.profiles_id !== req.user.id) {
      return res.status(403).json({ 
        success: false,
        message: 'Not authorized to view these inquiries' 
      });
    }

    const { data: inquiries, error } = await supabase
      .from('property_inquiries')
      .select(`
        *,
        profiles:profiles_id (
          firstname,
          lastname,
          email,
          phone,
          profile_photo
        )
      `)
      .eq('property_id', propertyId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Database error fetching inquiries:', error);
      throw error;
    }

    res.json({
      success: true,
      data: inquiries
    });
  } catch (error) {
    logger.error('Error in get property inquiries:', error);
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
});

// Get all inquiries for authenticated user
router.get('/user', authenticateUser, async (req, res) => {
  try {
    const { data: inquiries, error } = await supabase
      .from('property_inquiries')
      .select(`
        *,
        property:property_id (
          title,
          main_image,
          price,
          address,
          city,
          governate
        )
      `)
      .eq('profiles_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Database error fetching user inquiries:', error);
      throw error;
    }

    res.json({
      success: true,
      data: inquiries
    });
  } catch (error) {
    logger.error('Error in get user inquiries:', error);
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
});

// Create a new property inquiry
router.post('/', authenticateUser, async (req, res) => {
  try {
    const { property_id, subject, message } = req.body;

    // Validate required fields
    if (!property_id || !message) {
      return res.status(400).json({ 
        success: false,
        message: 'Property ID and message are required' 
      });
    }

    // Check if property exists
    const { data: property, error: propertyError } = await supabase
      .from('properties')
      .select('id, profiles_id')
      .eq('id', property_id)
      .single();

    if (propertyError || !property) {
      logger.error('Property not found:', { property_id, error: propertyError });
      return res.status(404).json({ 
        success: false,
        message: 'Property not found' 
      });
    }

    // Prevent users from inquiring about their own properties
    if (property.profiles_id === req.user.id) {
      return res.status(400).json({ 
        success: false,
        message: 'You cannot inquire about your own property' 
      });
    }

    // Check if user has already made an inquiry for this property
    const { data: existingInquiry, error: inquiryError } = await supabase
      .from('property_inquiries')
      .select('id')
      .eq('property_id', property_id)
      .eq('profiles_id', req.user.id)
      .single();

    if (existingInquiry) {
      return res.status(400).json({ 
        success: false,
        message: 'You have already made an inquiry for this property' 
      });
    }

    // Create the inquiry
    const { data: inquiry, error } = await supabase
      .from('property_inquiries')
      .insert([
        {
          property_id,
          profiles_id: req.user.id,
          subject,
          message,
          status: 'pending'
        }
      ])
      .select()
      .single();

    if (error) {
      logger.error('Database error creating inquiry:', error);
      throw error;
    }

    res.status(201).json({
      success: true,
      data: inquiry
    });
  } catch (error) {
    logger.error('Error in create inquiry:', error);
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
});

// Update inquiry status (for property owners)
router.patch('/:inquiryId/status', authenticateUser, async (req, res) => {
  try {
    const { inquiryId } = req.params;
    const { status } = req.body;

    // Validate status
    const validStatuses = ['pending', 'responded', 'closed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid status' 
      });
    }

    // Get the inquiry and check ownership
    const { data: inquiry, error: inquiryError } = await supabase
      .from('property_inquiries')
      .select('property_id')
      .eq('id', inquiryId)
      .single();

    if (inquiryError || !inquiry) {
      logger.error('Inquiry not found:', { inquiryId, error: inquiryError });
      return res.status(404).json({ 
        success: false,
        message: 'Inquiry not found' 
      });
    }

    // Check if user owns the property
    const { data: property, error: propertyError } = await supabase
      .from('properties')
      .select('profiles_id')
      .eq('id', inquiry.property_id)
      .single();

    if (propertyError || !property) {
      logger.error('Property not found:', { propertyId: inquiry.property_id, error: propertyError });
      return res.status(404).json({ 
        success: false,
        message: 'Property not found' 
      });
    }

    if (property.profiles_id !== req.user.id) {
      return res.status(403).json({ 
        success: false,
        message: 'Not authorized to update this inquiry' 
      });
    }

    // Update the inquiry status
    const { data: updatedInquiry, error } = await supabase
      .from('property_inquiries')
      .update({ status })
      .eq('id', inquiryId)
      .select()
      .single();

    if (error) {
      logger.error('Database error updating inquiry:', error);
      throw error;
    }

    res.json({
      success: true,
      data: updatedInquiry
    });
  } catch (error) {
    logger.error('Error in update inquiry status:', error);
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
});

// Delete an inquiry (users can delete their own inquiries)
router.delete('/:inquiryId', authenticateUser, async (req, res) => {
  try {
    const { inquiryId } = req.params;

    // Check if user owns the inquiry
    const { data: inquiry, error: inquiryError } = await supabase
      .from('property_inquiries')
      .select('profiles_id')
      .eq('id', inquiryId)
      .single();

    if (inquiryError || !inquiry) {
      logger.error('Inquiry not found:', { inquiryId, error: inquiryError });
      return res.status(404).json({ 
        success: false,
        message: 'Inquiry not found' 
      });
    }

    if (inquiry.profiles_id !== req.user.id) {
      return res.status(403).json({ 
        success: false,
        message: 'Not authorized to delete this inquiry' 
      });
    }

    // Delete the inquiry
    const { error } = await supabase
      .from('property_inquiries')
      .delete()
      .eq('id', inquiryId);

    if (error) {
      logger.error('Database error deleting inquiry:', error);
      throw error;
    }

    res.status(204).send();
  } catch (error) {
    logger.error('Error in delete inquiry:', error);
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
});

module.exports = router;
