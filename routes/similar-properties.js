const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabaseClient');
const logger = require('../utils/logger');
const cors = require('cors');

// Enable CORS for this route
router.use(cors());

// Simple in-memory cache (node instance–local)
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
// Map<cacheKey, { timestamp:number, payload:object }>
const cache = new Map();

// Get similar properties
router.get('/:id', async (req, res) => {
  try {
    // Build cache key
    const { id } = req.params;
    const { limit = 4 } = req.query;
    const numLimit = parseInt(limit);
    const cacheKey = `${id}_${numLimit}`;

    // Serve from cache if still fresh
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION_MS) {
      logger.debug(`Serving similar properties for ${id} from cache`);
      return res.json(cached.payload);
    }

    logger.info(`Getting similar properties for property ID: ${id}`);

    // First get the current property to match against
    const { data: currentProperty, error: propertyError } = await supabase
      .from('properties')
      .select('*')  // Get all fields for better ML matching
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
      logger.warn(`Property with ID ${id} not found`);
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
        features,
        is_featured,
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
      .limit(numLimit * 15); // Fetch reasonable subset for ML to speed up

    if (error) {
      logger.error('Error fetching similar properties:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch similar properties'
      });
    }

    // Simple filtering (no ML) and limit
    logger.info('Using basic filtering for similar properties');
    // Transform data to match frontend expectations
    const transformedData = similarProperties
      .slice(0, numLimit)
      .map(property => ({
        ...property,
        agent: {
          name: `${property.profiles?.firstname || ''} ${property.profiles?.lastname || ''}`.trim(),
          photo: property.profiles?.profile_photo
        }
      }));

    const payload = {
      success: true,
      data: transformedData
    };

    // Cache and respond
    cache.set(cacheKey, { timestamp: Date.now(), payload });
    res.json(payload);
  } catch (err) {
    logger.error('Error fetching similar properties:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch similar properties'
    });
  }
});

module.exports = router;

 