const express = require('express');
const router = express.Router();
const { supabase } = require('../utils/supabaseClient');

// Helper function to calculate similarity between properties
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
      // Get user's recent views
      const { data: viewsData, error: viewsError } = await supabase
        .from('property_views')
        .select('*, property:properties(*)')
        .eq('profiles_id', user_id)
        .order('viewed_at', { ascending: false })
        .limit(10);

      if (viewsError) throw viewsError;

      if (!viewsData.length) {
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
            city,
            governate,
            main_image,
            created_at,
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

        if (recommendedError) throw recommendedError;
        return res.json({ success: true, data: recommended });
      }

      // Get all available properties
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
          city,
          governate,
          main_image,
          created_at,
          profiles:profiles!properties_profiles_id_fkey (
            firstname,
            lastname,
            profile_photo
          )
        `)
        .eq('verified', true);

      if (propertiesError) throw propertiesError;

      // Calculate recommendations based on viewing history
      const recommendations = allProperties
        .filter(prop => !viewsData.find(view => view.property_id === prop.id))
        .map(property => {
          const totalScore = viewsData.reduce((score, view) => {
            return score + calculatePropertySimilarity(view.property, property);
          }, 0);
          
          return {
            property,
            score: totalScore / viewsData.length
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(item => item.property);

      res.json({ success: true, data: recommendations });
    } else {
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
          city,
          governate,
          main_image,
          created_at,
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

      if (recommendedError) throw recommendedError;
      res.json({ success: true, data: recommended });
    }
  } catch (error) {
    console.error('Error in /recommended:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get recommendations'
    });
  }
});

module.exports = router; 