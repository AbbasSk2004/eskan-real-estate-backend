const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabaseClient');
const { getUserRecommendations } = require('../utils/pythonRecommendationEngine');
const logger = require('../utils/logger');
const { spawn } = require('child_process');

// Helper function to calculate similarity between properties (fallback if Python fails)
const calculatePropertySimilarity = (property1, property2) => {
  let score = 0;
  
  // Property type comparison (highest weight)
  if (property1.property_type === property2.property_type) score += 5;
  
  // Price range comparison (within 20%)
  const priceRange = Math.abs(property1.price - property2.price) / property1.price;
  if (priceRange <= 0.2) score += 4;
  
  // Location comparison
  if (property1.governate === property2.governate) score += 3;
  if (property1.city === property2.city) score += 2;
  
  // Features comparison
  if (property1.bedrooms === property2.bedrooms) score += 1;
  if (property1.bathrooms === property2.bathrooms) score += 1;
  if (property1.area && property2.area) {
    const areaRange = Math.abs(property1.area - property2.area) / property1.area;
    if (areaRange <= 0.2) score += 1;
  }

  return score;
};

// Get recommended properties
router.get('/recommended', async (req, res) => {
  try {
    const { user_id } = req.query;
    const limit = parseInt(req.query.limit) || 5;

    if (user_id) {
      logger.info(`Getting recommendations for user: ${user_id}`);
      
      // Get user's recent views from real database
      const { data: viewsData, error: viewsError } = await supabase
        .from('property_views')
        .select(`
          id,
          property_id,
          profiles_id,
          viewed_at,
          ip_address
        `)
        .eq('profiles_id', user_id)
        .order('viewed_at', { ascending: false })
        .limit(10);

      if (viewsError) {
        logger.error('Error fetching user views:', viewsError);
        throw viewsError;
      }

      if (!viewsData || viewsData.length === 0) {
        logger.info('No viewing history found, returning recommended properties');
        // Fallback to recommended and verified properties if no viewing history
        const { data: recommended, error: recommendedError } = await supabase
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
            city,
            governate,
            main_image,
            created_at,
            is_featured,
            recommended,
            features,
            profiles:profiles!properties_profiles_id_fkey (
              firstname,
              lastname,
              profile_photo
            )
          `)
          .eq('verified', true)
          .eq('recommended', true)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (recommendedError) {
          logger.error('Error fetching recommended properties:', recommendedError);
          throw recommendedError;
        }
        
        return res.json({ success: true, data: recommended });
      }

      // Get all available properties from real database
      const { data: allProperties, error: propertiesError } = await supabase
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
          city,
          governate,
          main_image,
          created_at,
          is_featured,
          recommended,
          features,
          profiles:profiles!properties_profiles_id_fkey (
            firstname,
            lastname,
            profile_photo
          )
        `)
        .eq('verified', true);

      if (propertiesError) {
        logger.error('Error fetching all properties:', propertiesError);
        throw propertiesError;
      }

      // For each viewed property, get the full property data
      const viewedProperties = [];
      for (const view of viewsData) {
        const property = allProperties.find(p => p.id === view.property_id);
        if (property) {
          viewedProperties.push({
            property_id: view.property_id,
            property
          });
        }
      }

      let mlRecommendationsFailed = false;
      let mlError = null;
      
      try {
        logger.info('Using scikit-learn for recommendations');
        // Try using scikit-learn recommendation engine with real data
        const recommendedIds = await getUserRecommendations(viewedProperties, allProperties, limit);
        
        if (recommendedIds && recommendedIds.length > 0) {
          // Filter properties to get only the recommended ones
          const recommendedProperties = allProperties.filter(prop => 
            recommendedIds.includes(prop.id)
          );
          
          // Sort them in the same order as the IDs
          const sortedRecommendations = recommendedIds.map(id => 
            recommendedProperties.find(prop => prop.id === id)
          ).filter(Boolean);
          
          logger.info(`Found ${sortedRecommendations.length} recommendations using scikit-learn`);
          return res.json({ 
            success: true, 
            data: sortedRecommendations,
            source: 'ml'
          });
        } else {
          logger.warn('ML engine returned empty recommendations, falling back to JavaScript');
          mlRecommendationsFailed = true;
          mlError = new Error('Empty ML recommendations');
        }
      } catch (pythonError) {
        logger.error('Python recommendation engine failed, using JavaScript fallback:', pythonError);
        // Fall back to JavaScript implementation if Python fails
        mlRecommendationsFailed = true;
        mlError = pythonError;
      }

      // Fallback: Calculate recommendations using JavaScript
      logger.info('Using JavaScript fallback for recommendations');
      const recommendations = allProperties
        .filter(prop => !viewsData.find(view => view.property_id === prop.id))
        .map(property => {
          const totalScore = viewedProperties.reduce((score, view) => {
            return score + calculatePropertySimilarity(view.property, property);
          }, 0);
          
          return {
            property,
            score: totalScore / viewedProperties.length
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(item => item.property);

      res.json({ 
        success: true, 
        data: recommendations,
        source: 'js',
        mlFailed: mlRecommendationsFailed,
        mlError: mlError ? mlError.message : null
      });
    } else {
      logger.info('No user ID provided, returning recommended properties');
      // Return recommended and verified properties for non-authenticated users
      const { data: recommended, error: recommendedError } = await supabase
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
          city,
          governate,
          main_image,
          created_at,
          is_featured,
          recommended,
          features,
          profiles:profiles!properties_profiles_id_fkey (
            firstname,
            lastname,
            profile_photo
          )
        `)
        .eq('verified', true)
        .eq('recommended', true)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (recommendedError) {
        logger.error('Error fetching recommended properties:', recommendedError);
        throw recommendedError;
      }
      
      res.json({ 
        success: true, 
        data: recommended,
        source: 'default'
      });
    }
  } catch (error) {
    logger.error('Error in /recommended:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get recommendations',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Test endpoint to check Python availability
router.get('/test-python', async (req, res) => {
  try {
    logger.info('Testing Python environment');
    
    // Determine Python command based on platform
    let pythonCmd = process.env.PYTHON_CMD;
    if (!pythonCmd) {
      pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    }
    
    // Run a simple Python command to check version
    const pythonProcess = spawn(pythonCmd, ['-V']);
    
    let result = '';
    let error = '';
    
    pythonProcess.stdout.on('data', (data) => {
      result += data.toString();
    });
    
    pythonProcess.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        logger.error(`Python check failed with code ${code}: ${error}`);
        return res.status(500).json({ 
          success: false, 
          error: `Python check failed with code ${code}: ${error}` 
        });
      }
      
      // Also check for required modules
      const moduleProcess = spawn(pythonCmd, ['-c', 'import numpy, pandas, sklearn, json; print("All modules loaded successfully")']);
      
      let moduleResult = '';
      let moduleError = '';
      
      moduleProcess.stdout.on('data', (data) => {
        moduleResult += data.toString();
      });
      
      moduleProcess.stderr.on('data', (data) => {
        moduleError += data.toString();
      });
      
      moduleProcess.on('close', (moduleCode) => {
        if (moduleCode !== 0) {
          logger.error(`Python modules check failed: ${moduleError}`);
          return res.status(500).json({
            success: false,
            pythonVersion: result || error,
            moduleError: moduleError,
            message: 'Required Python modules are missing'
          });
        }
        
        res.json({
          success: true,
          pythonVersion: result || error,
          modulesCheck: moduleResult,
          message: 'Python environment is working correctly'
        });
      });
    });
    
    // Handle spawn errors
    pythonProcess.on('error', (err) => {
      logger.error(`Failed to start Python process: ${err.message}`);
      res.status(500).json({ 
        success: false, 
        error: `Failed to start Python process: ${err.message}` 
      });
    });
    
  } catch (error) {
    logger.error('Error testing Python:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to test Python environment' 
    });
  }
});

module.exports = router;