const { getUserRecommendations, getSimilarProperties } = require('../utils/pythonRecommendationEngine');
const { supabase } = require('../config/supabaseClient');
const logger = require('../utils/logger');

async function testRecommendations() {
  try {
    logger.info('Starting recommendation engine test with real database data');
    
    // Fetch properties from database
    const { data: properties, error } = await supabase
      .from('properties')
      .select('*')
      .limit(10);
      
    if (error) {
      logger.error('Error fetching properties:', error);
      return;
    }
    
    logger.info(`Fetched ${properties.length} properties from database`);
    
    if (properties.length === 0) {
      logger.error('No properties found in database');
      return;
    }
    
    // Create mock history with first property
    const mockHistory = [{ property_id: properties[0].id }];
    
    // Test user recommendations
    logger.info('Testing user recommendations...');
    const recommendations = await getUserRecommendations(mockHistory, properties);
    logger.info(`Got ${recommendations.length} recommendations`);
    logger.info('Recommendations:', recommendations);
    
    // Test similar properties
    logger.info('Testing similar properties...');
    const similarProperties = await getSimilarProperties(properties[0].id, properties);
    logger.info(`Got ${similarProperties.length} similar properties`);
    logger.info('Similar properties:', similarProperties);
    
    logger.info('Recommendation engine test completed successfully');
  } catch (err) {
    logger.error('Error testing recommendation engine:', err);
  }
}

// Run the test
testRecommendations();