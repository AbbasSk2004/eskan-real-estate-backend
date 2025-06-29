const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { supabase, supabasePublic } = require('../config/supabaseClient');

// Helper function to verify session
const verifySession = async (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: 'No token provided' };
  }

  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await supabasePublic.auth.getUser(token);

  if (error || !user) {
    return { error: 'Invalid token' };
  }

  return { user };
};

// Check favorite status - Optimized for quick response
router.get('/:propertyId/status', async (req, res) => {
  try {
    // Verify session
    const { user, error: authError } = await verifySession(req);
    if (authError) {
      return res.status(401).json({
        success: false,
        message: 'Please log in to check favorite status'
      });
    }

    const { propertyId } = req.params;

    // Use a simpler query for faster response
    const { data, error } = await supabasePublic
      .from('favorites')
      .select('id')
      .eq('property_id', propertyId)
      .eq('profiles_id', user.id)
      .maybeSingle(); // Use maybeSingle instead of single for better performance

    if (error && error.code !== 'PGRST116') throw error;

    res.json({
      success: true,
      isFavorited: !!data
    });
  } catch (err) {
    logger.error('Error checking favorite status:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to check favorite status'
    });
  }
});

// Add to favorites
router.post('/:propertyId', async (req, res) => {
  try {
    // Verify session
    const { user, error: authError } = await verifySession(req);
    if (authError) {
      return res.status(401).json({
        success: false,
        message: 'Please log in to add to favorites'
      });
    }

    const { propertyId } = req.params;

    // Check if already in favorites
    const { data: existing, error: checkError } = await supabasePublic
      .from('favorites')
      .select('id')
      .eq('property_id', propertyId)
      .eq('profiles_id', user.id)
      .single();

    if (checkError && checkError.code !== 'PGRST116') throw checkError;

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Property is already in favorites'
      });
    }

    const { data, error } = await supabasePublic
      .from('favorites')
      .insert([{        
        property_id: propertyId,
        profiles_id: user.id
      }])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: 'Added to favorites',
      data: data || null  // data could be null if the insert succeeded but notification trigger failed
    });
  } catch (err) {
    logger.error('Error adding to favorites:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to add to favorites'
    });
  }
});

// Remove from favorites
router.delete('/:propertyId', async (req, res) => {
  try {
    // Verify session
    const { user, error: authError } = await verifySession(req);
    if (authError) {
      return res.status(401).json({
        success: false,
        message: 'Please log in to remove from favorites'
      });
    }

    const { propertyId } = req.params;

    const { error } = await supabasePublic
      .from('favorites')
      .delete()
      .eq('property_id', propertyId)
      .eq('profiles_id', user.id);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Removed from favorites'
    });
  } catch (err) {
    logger.error('Error removing from favorites:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to remove from favorites'
    });
  }
});

// Get user's favorites
router.get('/user', async (req, res) => {
  try {
    // Verify session
    const { user, error: authError } = await verifySession(req);
    if (authError) {
      return res.status(401).json({
        success: false,
        message: 'Please log in to view your favorites'
      });
    }

    const { data, error } = await supabasePublic
      .from('favorites')
      .select(`
        id,
        property_id,
        properties!favorites_property_id_fkey (
          id,
          title,
          description,
          property_type,
          status,
          price,
          bedrooms,
          bathrooms,
          area,
          floor,
          units,
          meeting_rooms,
          parking_spaces,
          shop_front_width,
          storage_area,
          plot_size,
          land_type,
          ceiling_height,
          loading_docks,
          city,
          governate,
          main_image,
          created_at,
          profiles!properties_profiles_id_fkey (
            firstname,
            lastname,
            email,
            phone,
            profile_photo
          )
        )
      `)
      .eq('profiles_id', user.id);

    if (error) throw error;

    // Transform data to match frontend expectations
    const transformedData = data.map(favorite => ({
      id: favorite.id,
      ...favorite.properties,
      agent: {
        name: `${favorite.properties?.profiles?.firstname || ''} ${favorite.properties?.profiles?.lastname || ''}`.trim(),
        photo: favorite.properties?.profiles?.profile_photo
      }
    }));

    res.json({
      success: true,
      data: transformedData || []
    });
  } catch (err) {
    logger.error('Error fetching user favorites:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch your favorites'
    });
  }
});

module.exports = router;
