const express = require('express');
const router = express.Router();
const multer = require('multer');
const { supabase } = require('../config/supabaseClient');
const logger = require('../utils/logger');
const { uploadToSupabaseStorage } = require('../utils/storage');

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
}).array('images', 10); // Allow up to 10 images

// Helper function to verify session
const verifySession = async (req) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { error: 'No token provided' };
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return { error: 'Invalid token' };
    }

    // Get user profile from database
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('profiles_id', user.id)
      .single();

    if (profileError) {
      if (profileError.code === 'PGRST116') { // No profile found
        // Get user metadata from Google auth
        const userData = user?.user_metadata || {};
        
        // Create new profile with correct data structure
        const newProfile = {
          profiles_id: user.id,
          email: user.email,
          firstname: userData.full_name?.split(' ')[0] || '',
          lastname: userData.full_name?.split(' ').slice(1).join(' ') || '',
          profile_photo: userData.avatar_url || userData.picture || '',
          role: 'user',
          status: 'active'
        };

        const { data: createdProfile, error: createError } = await supabase
          .from('profiles')
          .upsert([newProfile], {
            onConflict: 'profiles_id',
            ignoreDuplicates: false
          })
          .select()
          .single();

        if (createError) {
          logger.error('Profile creation error:', createError);
          return { error: createError.message };
        }

        return { user, profile: createdProfile };
      }
      
      logger.error('Profile fetch error:', profileError);
      return { error: profileError.message };
    }

    return { user, profile };
  } catch (err) {
    logger.error('Session verification error:', err);
    return { error: 'Session verification failed' };
  }
};

// Get featured properties
router.get('/featured', async (req, res) => {
  try {
    const { data, error } = await supabase
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
        meeting_rooms,
        parking_spaces,
        shop_front_width,
        storage_area,
        units,
        elevators,
        plot_size,
        land_type,
        ceiling_height,
        loading_docks,
        water_source,
        crop_types,
        view,
        created_at,
        profiles:profiles!properties_profiles_id_fkey (
          firstname,
          lastname,
          profile_photo
        )
      `)
      .eq('is_featured', true)
      .eq('verified', true)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Error fetching featured properties:', error);
      return res.status(500).json({ 
        success: false, 
        message: error.message || 'Failed to fetch featured properties'
      });
    }

    // Transform data to match frontend expectations
    const formattedData = data.map(property => ({
      ...property,
      agent: {
        name: `${property.profiles?.firstname || ''} ${property.profiles?.lastname || ''}`.trim(),
        photo: property.profiles?.profile_photo
      }
    }));

    res.json({
      success: true,
      data: formattedData
    });
  } catch (err) {
    logger.error('Error fetching featured properties:', {
      error: err.message,
      stack: err.stack
    });
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch featured properties'
    });
  }
});

// Get recommended properties
router.get('/recommended', async (req, res) => {
  try {
    // Get properties that are:
    // 1. Have complete information (images, description)
    // 2. Are recommended and verified
    // 3. Limit to 6 properties
    const { data, error } = await supabase
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
        meeting_rooms,
        parking_spaces,
        shop_front_width,
        storage_area,
        units,
        elevators,
        plot_size,
        land_type,
        ceiling_height,
        loading_docks,
        water_source,
        crop_types,
        view,
        created_at,
        profiles:profiles!properties_profiles_id_fkey (
          firstname,
          lastname,
          profile_photo
        )
      `)
      .eq('recommended', true)
      .eq('verified', true)
      .not('main_image', 'is', null)
      .not('description', 'is', null)
      .order('created_at', { ascending: false })
     

    if (error) {
      logger.error('Error fetching recommended properties:', error);
      return res.status(500).json({ 
        success: false, 
        message: error.message || 'Failed to fetch recommended properties'
      });
    }

    // Transform data to match frontend expectations
    const formattedData = data.map(property => ({
      ...property,
      agent: {
        name: `${property.profiles?.firstname || ''} ${property.profiles?.lastname || ''}`.trim(),
        photo: property.profiles?.profile_photo
      }
    }));

    res.json({
      success: true,
      data: formattedData
    });
  } catch (err) {
    logger.error('Error fetching recommended properties:', {
      error: err.message,
      stack: err.stack
    });
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch recommended properties'
    });
  }
});

// Get user's properties
router.get('/user/properties', async (req, res) => {
  try {
    // Verify session
    const { user, profile, error: authError } = await verifySession(req);
    if (authError) {
      return res.status(401).json({
        success: false,
        message: 'Please log in to view your properties'
      });
    }

    const { data, error } = await supabase
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
        units,
        elevators,
        plot_size,
        land_type,
        ceiling_height,
        loading_docks,
        year_built,
        city,
        governate,
        main_image,
        meeting_rooms,
        parking_spaces,
        shop_front_width,
        storage_area,
        water_source,
        crop_types,
        view,
        verified,
        created_at,
        profiles!properties_profiles_id_fkey (
          firstname,
          lastname,
          email,
          phone,
          profile_photo
        )
      `)
      .eq('profiles_id', user.id)
      .eq('verified', true) // Only show verified properties
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Error fetching user properties:', error);
      throw error;
    }

    // Transform data to match frontend expectations
    const transformedData = data.map(property => ({
      ...property,
      agent: {
        name: `${property.profiles?.firstname || ''} ${property.profiles?.lastname || ''}`.trim(),
        photo: property.profiles?.profile_photo
      }
    }));

    res.json({
      success: true,
      data: transformedData || []
    });
  } catch (err) {
    logger.error('Error fetching user properties:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch your properties'
    });
  }
});

// Get all properties
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 12,
      keyword,
      propertyType,
      status,
      governorate,
      city,
      priceMin,
      priceMax,
      areaMin,
      areaMax,
      village,
      bedrooms,
      bathrooms,
      features,
      sortBy = 'newest',
      verified = true
    } = req.query;

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
        units,
        elevators,
        plot_size,
        land_type,
        ceiling_height,
        loading_docks,
        year_built,
        city,
        governate,
        main_image,
        meeting_rooms,
        parking_spaces,
        shop_front_width,
        storage_area,
        water_source,
        crop_types,
        view,
        created_at,
        profiles:profiles_id (
          firstname,
          lastname,
          profile_photo
        )
      `, { count: 'exact' });

    // Always filter for verified properties unless explicitly set to false
    if (verified !== 'false') {
      query = query.eq('verified', true);
    }

    // Apply filters
    if (status) {
      query = query.eq('status', status);
    }
    if (propertyType) {
      query = query.eq('property_type', propertyType);
    }
    if (req.query.is_featured === 'true') {
      query = query.eq('is_featured', true);
    }
    if (governorate) {
      query = query.eq('governate', governorate);
    }
    if (city) {
      query = query.eq('city', city);
    }
    if (village) {
      query = query.eq('village', village);
    }
    if (priceMin) {
      query = query.gte('price', parseFloat(priceMin));
    }
    if (priceMax) {
      query = query.lte('price', parseFloat(priceMax));
    }
    if (areaMin) {
      query = query.gte('area', parseFloat(areaMin));
    }
    if (areaMax) {
      query = query.lte('area', parseFloat(areaMax));
    }
    if (bedrooms) {
      query = query.gte('bedrooms', parseInt(bedrooms));
    }
    if (bathrooms) {
      query = query.gte('bathrooms', parseInt(bathrooms));
    }
    if (features) {
      const featureList = features.split(',').filter(Boolean);
      if (featureList.length) {
        const featureObj = {};
        featureList.forEach(f => { featureObj[f] = true; });
        query = query.contains('features', featureObj);
      }
    }
    if (keyword) {
      query = query.ilike('title', `%${keyword}%`);
    }

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
      logger.error('Error fetching properties:', error);
      throw error;
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
    logger.error('Error fetching properties:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch properties'
    });
  }
});

// Get single property by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch property with related data
    const { data, error } = await supabase
      .from('properties')
      .select(`
        *,
        profiles:profiles_id (
          id,
          profiles_id,
          firstname,
          lastname,
          email,
          phone,
          profile_photo,
          role
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      logger.error('Error fetching property:', error);
      throw error;
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }

    res.json({
      success: true,
      data
    });
  } catch (err) {
    logger.error('Error fetching property:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch property details'
    });
  }
});

// Record property view
router.post('/:id/views', async (req, res) => {
  try {
    // Verify session
    const { user, error: authError } = await verifySession(req);
    if (authError) {
      return res.status(401).json({
        success: false,
        message: 'Please log in to record property view'
      });
    }

    const { id } = req.params;

    const { data, error } = await supabase
      .from('property_views')
      .insert([{
        properties_id: id,
        profiles_id: user.id,
        viewed_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: 'Property view recorded',
      data
    });
  } catch (err) {
    logger.error('Error recording property view:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to record property view'
    });
  }
});

// Add property to favorites
router.post('/:id/favorites', async (req, res) => {
  try {
    // Verify session
    const { user, error: authError } = await verifySession(req);
    if (authError) {
      return res.status(401).json({
        success: false,
        message: 'Please log in to add property to favorites'
      });
    }

    const { id } = req.params;

    const { data, error } = await supabase
      .from('favorites')
      .insert([{
        properties_id: id,
        profiles_id: user.id,
        added_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: 'Property added to favorites',
      data
    });
  } catch (err) {
    logger.error('Error adding property to favorites:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to add property to favorites'
    });
  }
});

// Create new property
router.post('/', async (req, res) => {
  try {
    // Handle file upload with error handling
    upload(req, res, async function(err) {
      if (err instanceof multer.MulterError) {
        logger.error('Multer error:', err);
        return res.status(400).json({
          success: false,
          message: err.message
        });
      } else if (err) {
        logger.error('Unknown error during upload:', err);
        return res.status(500).json({
          success: false,
          message: 'Error uploading files'
        });
      }

      try {
        // Verify session
        const { user, error: authError } = await verifySession(req);
        if (authError) {
          return res.status(401).json({
            success: false,
            message: 'Please log in to create property'
          });
        }

        const imageUrls = [];
        let mainImageUrl = null;

        // Upload images to Supabase storage
        if (req.files && req.files.length > 0) {
          for (let i = 0; i < req.files.length; i++) {
            const file = req.files[i];
            const fileName = `${user.id}-${Date.now()}-${i}-${file.originalname}`;
            const imageUrl = await uploadToSupabaseStorage(file, 'property-images', fileName);
            imageUrls.push(imageUrl);
            
            // Use the first image as main image if none specified
            if (i === 0) {
              mainImageUrl = imageUrl;
            }
          }
        }

        // Prepare property data
        const propertyData = {
          profiles_id: user.id,
          title: req.body.title,
          description: req.body.description,
          property_type: req.body.property_type,
          status: req.body.status,
          price: parseFloat(req.body.price),
          area: parseFloat(req.body.area),
          bedrooms: req.body.bedrooms ? parseInt(req.body.bedrooms) : null,
          bathrooms: req.body.bathrooms ? parseInt(req.body.bathrooms) : null,
          livingrooms: req.body.livingrooms ? parseInt(req.body.livingrooms) : null,
          floor: (req.body.floor || req.body.floors) ? parseInt(req.body.floor || req.body.floors) : null,
          parking_spaces: req.body.parking_spaces ? parseInt(req.body.parking_spaces) : null,
          address: req.body.address,
          city: req.body.city,
          governate: req.body.governate,
          village: req.body.village,
          features: req.body.features ? JSON.parse(req.body.features) : {},
          images: imageUrls,
          main_image: mainImageUrl,
          location_url: req.body.location_url,
          garden_area: req.body.garden_area ? parseFloat(req.body.garden_area) : null,
          view: req.body.view || null,
          meeting_rooms: req.body.meeting_rooms ? parseInt(req.body.meeting_rooms) : null,
          office_layout: req.body.office_layout || null,
          year_built: req.body.year_built ? parseInt(req.body.year_built) : null,
          furnishing_status: req.body.furnishing_status,
          water_source: req.body.water_source || null,
          crop_types: req.body.crop_types || null,
          shop_front_width: req.body.shop_front_width ? parseFloat(req.body.shop_front_width) : null,
          storage_area: req.body.storage_area ? parseFloat(req.body.storage_area) : null,
          // Building-specific fields
          units: req.body.units ? parseInt(req.body.units) : null,
          elevators: req.body.elevators ? parseInt(req.body.elevators) : null,
          // Land-specific fields
          plot_size: req.body.plot_size ? parseFloat(req.body.plot_size) : null,
          land_type: req.body.land_type || null,
          zoning: req.body.zoning || null,
          // Warehouse-specific fields
          ceiling_height: req.body.ceiling_height ? parseFloat(req.body.ceiling_height) : null,
          loading_docks: req.body.loading_docks ? parseInt(req.body.loading_docks) : null,
          created_at: new Date().toISOString()
        };

        // Insert property into database
        const { data, error } = await supabase
          .from('properties')
          .insert([propertyData])
          .select()
          .single();

        if (error) throw error;

        res.status(201).json({
          success: true,
          message: 'Property created successfully',
          data
        });
      } catch (error) {
        logger.error('Error creating property:', error);
        res.status(500).json({
          success: false,
          message: error.message || 'Failed to create property'
        });
      }
    });
  } catch (err) {
    logger.error('Error in property creation route:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to process property creation'
    });
  }
});

// Delete property
router.delete('/:id', async (req, res) => {
  try {
    // Verify session
    const { user, error: authError } = await verifySession(req);
    if (authError) {
      return res.status(401).json({
        success: false,
        message: 'Please log in to delete property'
      });
    }

    const { id } = req.params;

    // Check if user owns the property
    const { data: property, error: propertyError } = await supabase
      .from('properties')
      .select('profiles_id')
      .eq('id', id)
      .single();

    if (propertyError) throw propertyError;

    if (!property) {
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }

    if (property.profiles_id !== user.id) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to delete this property'
      });
    }

    // Delete property
    const { error } = await supabase
      .from('properties')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Property deleted successfully'
    });
  } catch (err) {
    logger.error('Error deleting property:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to delete property'
    });
  }
});

module.exports = router; 