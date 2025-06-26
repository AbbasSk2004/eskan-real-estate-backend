const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabaseClient');
const logger = require('../utils/logger');

// Get properties by type
router.get('/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const {
      page = 1,
      pageSize = 12,
      sortBy = 'newest',
    } = req.query;

    if (!type) {
      return res.status(400).json({
        success: false,
        message: 'Property type is required'
      });
    }

    // Build base query
    let query = supabase
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
        floor,
        year_built,
        city,
        governate,
        main_image,
        created_at,
        profiles_id,
        profiles:profiles_id (
          firstname,
          lastname,
          profile_photo
        )
      `, { count: 'exact' });

    // Always filter for verified properties
    query = query.eq('verified', true);
    
    // Filter by property type
    query = query.eq('property_type', type);

    // Log the request details for debugging
    logger.info(`Fetching properties by type: ${type}`, {
      type,
      page,
      pageSize,
      sortBy
    });

    // Apply sorting
    switch (sortBy) {
      case 'newest':
        query = query.order('created_at', { ascending: false });
        break;
      case 'price_low':
        query = query.order('price', { ascending: true });
        break;
      case 'price_high':
        query = query.order('price', { ascending: false });
        break;
      case 'area_low':
        query = query.order('area', { ascending: true });
        break;
      case 'area_high':
        query = query.order('area', { ascending: false });
        break;
      default:
        query = query.order('created_at', { ascending: false });
    }

    // Apply pagination
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    // Execute query
    const { data, error, count } = await query;

    if (error) {
      logger.error('Error fetching properties by type:', error);
      return res.status(500).json({
        success: false,
        message: `Failed to fetch properties by type: ${error.message}`
      });
    }

    // If data is empty, still return a successful response with empty array
    if (!data || data.length === 0) {
      return res.json({
        success: true,
        properties: [],
        currentPage: parseInt(page),
        totalPages: 0,
        totalCount: 0,
        pageSize: parseInt(pageSize)
      });
    }

    // Transform data to match frontend expectations
    const transformedData = data.map(property => ({
      ...property,
      agent: {
        name: `${property.profiles?.firstname || ''} ${property.profiles?.lastname || ''}`.trim(),
        photo: property.profiles?.profile_photo
      }
    }));

    // Calculate pagination info
    const totalPages = Math.ceil(count / pageSize);

    res.json({
      success: true,
      properties: transformedData,
      currentPage: parseInt(page),
      totalPages,
      totalCount: count,
      pageSize: parseInt(pageSize)
    });
  } catch (err) {
    logger.error('Error fetching properties by type:', err);
    res.status(500).json({
      success: false,
      message: `Failed to fetch properties by type: ${err.message || 'Unknown error'}`
    });
  }
});

module.exports = router;
