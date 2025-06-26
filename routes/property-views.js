const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');
const { supabase, supabasePublic } = require('../config/supabaseClient');

// Initialize Supabase client with service role for RPC calls
const supabaseClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Get view count for a property (public endpoint)
router.get('/:propertyId/count', async (req, res) => {
  try {
    const { propertyId } = req.params;

    // Get total view count using the function
    const { data: count, error } = await supabaseClient
      .rpc('get_property_views', { property_uuid: propertyId });

    if (error) {
      logger.error('Error getting view count:', error);
      throw error;
    }

    res.json({
      success: true,
      data: {
        count: count || 0
      }
    });
  } catch (err) {
    logger.error('Error getting property view count:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to get view count',
      error: err.message
    });
  }
});

// Record a property view (public endpoint)
router.post('/:propertyId', async (req, res) => {
  try {
    const { propertyId } = req.params;
    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    // Get current count first
    const { data: currentCount, error: countError } = await supabaseClient
      .rpc('get_property_views', { property_uuid: propertyId });

    if (countError) {
      logger.error('Error getting view count:', countError);
      throw countError;
    }

    // Try to get user ID from auth header if available (but don't require it)
    let userId = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (!error && user) {
        userId = user.id;
      }
    }

    // Prepare timestamps
    const viewedAt = new Date();
    const viewedDate = viewedAt.toISOString().split('T')[0]; // YYYY-MM-DD for viewed_date column

    // Insert new view with viewed_date to satisfy NOT NULL constraint
    const { error: insertError } = await supabaseClient
      .from('property_views')
      .insert([{
        property_id: propertyId,
        ip_address: clientIp,
        profiles_id: userId,
        viewed_at: viewedAt.toISOString(),
        viewed_date: viewedDate
      }]);

    if (insertError) {
      // If error is due to unique constraint, it's not a real error
      if (insertError.code === '23505') { // Unique violation code
        return res.json({
          success: true,
          message: 'View already recorded',
          data: {
            count: currentCount || 0
          }
        });
      }
      logger.error('Error recording view:', insertError);
      throw insertError;
    }

    // Get updated count using the function
    const { data: updatedCount, error: updatedCountError } = await supabaseClient
      .rpc('get_property_views', { property_uuid: propertyId });

    if (updatedCountError) {
      logger.error('Error getting updated count:', updatedCountError);
      throw updatedCountError;
    }

    res.json({
      success: true,
      message: 'View recorded successfully',
      data: {
        count: updatedCount || 0
      }
    });
  } catch (err) {
    logger.error('Error recording property view:', err);
    // Return success with current count even on error to prevent UI disruption
    res.json({
      success: true,
      message: 'View recorded',
      data: {
        count: 0
      }
    });
  }
});

// Get total views for user's properties
router.get('/user/total', async (req, res) => {
  try {
    // Get user ID from auth header if available
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }

    // Get total views using the function
    const { data: total, error: viewsError } = await supabaseClient
      .rpc('get_user_total_views', { user_uuid: user.id });

    if (viewsError) {
      logger.error('Error getting total views:', viewsError);
      // Return 0 instead of throwing error
      return res.json({
        success: true,
        data: {
          total: 0
        }
      });
    }

    res.json({
      success: true,
      data: {
        total: total || 0
      }
    });
  } catch (err) {
    logger.error('Error getting total views:', err);
    // Return 0 instead of error
    res.json({
      success: true,
      data: { total: 0 }
    });
  }
});

// Get user's property views
router.get('/user', async (req, res) => {
  try {
    // Get user ID from auth token if available
    const userId = req.user?.id;

    // If no user ID, return empty data instead of error
    if (!userId) {
      return res.json({
        success: true,
        data: []
      });
    }

    // Get user's views with property details
    const { data: views, error } = await supabase
      .from('property_views')
      .select(`
        id,
        property_id,
        viewed_at,
        property:properties (*)
      `)
      .eq('profiles_id', userId)
      .order('viewed_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch property views'
      });
    }

    res.json({
      success: true,
      data: views || []
    });

  } catch (err) {
    console.error('Error in /property-views/user:', err);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching property views'
    });
  }
});

module.exports = router; 