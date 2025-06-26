const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabaseClient');
const logger = require('../utils/logger');
const cors = require('cors');

// Enable CORS for this route
router.use(cors());

// Get similar properties
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 4 } = req.query;

    // First get the current property to match against
    const { data: currentProperty, error: propertyError } = await supabase
      .from('properties')
      .select('property_type, price, city, governate')
      .eq('id', id)
      .single();

    if (propertyError) {
      logger.error('Error fetching current property:', propertyError);
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }

    if (!currentProperty) {
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }

    // Get similar properties with same property type and verified=true
    const { data: similarProperties, error } = await supabase
      .from('properties')
      .select(`
        id,
        title,
        description,
        property_type,
        status,
        price,
        bedrooms,
        bathrooms,
        area,
        city,
        governate,
        main_image,
        created_at,
        floor,
        year_built,
        garden_area,
        parking_spaces,
        furnishing_status,
        shop_front_width,
        storage_area,
        land_type,
        zoning,
        meeting_rooms,
        office_layout,
        units,
        elevators,
        plot_size,
        ceiling_height,
        loading_docks,
        farm_area,
        water_source,
        crop_types,
        view,
        profiles:profiles!properties_profiles_id_fkey (
          firstname,
          lastname,
          profile_photo
        )
      `)
      .eq('property_type', currentProperty.property_type)
      .eq('verified', true)  // Only get verified properties
      .neq('id', id) // Exclude current property
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (error) {
      logger.error('Error fetching similar properties:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch similar properties'
      });
    }

    // Transform data to match frontend expectations
    const transformedData = similarProperties.map(property => ({
      ...property,
      agent: {
        name: `${property.profiles?.firstname || ''} ${property.profiles?.lastname || ''}`.trim(),
        photo: property.profiles?.profile_photo
      }
    }));

    res.json({
      success: true,
      data: transformedData
    });
  } catch (err) {
    logger.error('Error fetching similar properties:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch similar properties'
    });
  }
});

module.exports = router;

 