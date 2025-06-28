const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const logger = require('./logger');

/**
 * Calls the Python recommendation engine and returns the results
 * @param {Object} data - The data to pass to the Python script
 * @returns {Promise<Object>} - The recommendation results
 */
const callPythonRecommendationEngine = async (data) => {
  return new Promise((resolve, reject) => {
    // Path to the Python script
    const scriptPath = path.join(__dirname, '../scripts/recommendation_engine.py');
    
    // Check if the script exists
    if (!fs.existsSync(scriptPath)) {
      logger.error('Python recommendation engine script not found');
      return reject(new Error('Python recommendation engine script not found'));
    }

    // Convert data to JSON string
    const dataString = JSON.stringify(data);
    
    // Determine Python command based on platform
    let pythonCmd = process.env.PYTHON_CMD;
    if (!pythonCmd) {
      pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    }
    
    logger.debug(`Spawning Python process using command: ${pythonCmd}, script path: ${scriptPath}`);
    
    // Set timeout for Python process (30 seconds - increased from 10 seconds)
    const timeout = 30000;
    let timeoutId;
    
    // Log input data size for debugging
    logger.debug(`Python input data size: ${dataString.length} characters`);
    logger.debug(`User history items: ${(data.user_history || []).length}, Properties: ${(data.all_properties || []).length}`);
    
    const pythonProcess = spawn(pythonCmd, [scriptPath, dataString]);
    
    let result = '';
    let error = '';

    // Collect data from script
    pythonProcess.stdout.on('data', (data) => {
      result += data.toString();
    });

    // Collect error messages
    pythonProcess.stderr.on('data', (data) => {
      error += data.toString();
      logger.error(`Python error: ${data.toString()}`);
    });

    // Handle process completion
    pythonProcess.on('close', (code) => {
      clearTimeout(timeoutId);
      
      if (code !== 0) {
        logger.error(`Python process exited with code ${code}: ${error}`);
        return reject(new Error(`Python process exited with code ${code}: ${error}`));
      }

      try {
        const parsedResult = JSON.parse(result);
        logger.debug('Successfully parsed Python output');
        resolve(parsedResult);
      } catch (err) {
        logger.error(`Failed to parse Python output: ${result}`);
        reject(new Error(`Failed to parse Python output: ${result}`));
      }
    });

    // Handle spawn errors (e.g., command not found)
    pythonProcess.on('error', (spawnErr) => {
      clearTimeout(timeoutId);
      logger.error(`Failed to start Python process: ${spawnErr.message}`);
      return reject(new Error(`Failed to start Python process: ${spawnErr.message}`));
    });
    
    // Set timeout to kill process if it takes too long
    timeoutId = setTimeout(() => {
      pythonProcess.kill();
      logger.error(`Python process timed out after ${timeout}ms`);
      reject(new Error(`Python process timed out after ${timeout}ms`));
    }, timeout);
  });
};

/**
 * Sanitize property data for Python processing
 * @param {Array} properties - Array of property objects
 * @returns {Array} - Sanitized property objects
 */
const sanitizePropertyData = (properties) => {
  return properties.map(prop => {
    // Create a clean copy with only the fields we need
    const cleanProp = {
      id: prop.id,
      property_type: prop.property_type || '',
      price: typeof prop.price === 'number' ? prop.price : 0,
      area: typeof prop.area === 'number' ? prop.area : 0,
      bedrooms: typeof prop.bedrooms === 'number' ? prop.bedrooms : 0,
      bathrooms: typeof prop.bathrooms === 'number' ? prop.bathrooms : 0,
      governate: prop.governate || '',
      city: prop.city || '',
      created_at: prop.created_at || new Date().toISOString(),
      is_featured: !!prop.is_featured
    };
    
    // Handle features as a string
    if (prop.features) {
      if (typeof prop.features === 'string') {
        cleanProp.features = prop.features;
      } else if (typeof prop.features === 'object') {
        cleanProp.features = JSON.stringify(prop.features);
      }
    }
    
    return cleanProp;
  });
};

/**
 * Get recommendations for a user based on their viewing history
 * @param {Array} userHistory - The user's property viewing history
 * @param {Array} allProperties - All available properties
 * @param {Number} limit - Maximum number of recommendations to return
 * @returns {Promise<Array>} - Array of recommended property IDs
 */
const getUserRecommendations = async (userHistory, allProperties, limit = 5) => {
  try {
    logger.info(`Getting ML recommendations for user with ${userHistory.length} viewed properties`);
    
    // Sanitize property data
    const sanitizedProperties = sanitizePropertyData(allProperties);
    
    // Prepare user history data
    const sanitizedHistory = userHistory.map(item => {
      return {
        property_id: item.property_id,
        // If the item has a property object, include it sanitized
        property: item.property ? sanitizePropertyData([item.property])[0] : undefined
      };
    });
    
    const result = await callPythonRecommendationEngine({
      mode: 'user_recommendations',
      user_history: sanitizedHistory,
      all_properties: sanitizedProperties,
      limit
    });

    if (!result.success) {
      logger.error(`Failed to get ML recommendations: ${result.error || 'Unknown error'}`);
      throw new Error(result.error || 'Failed to get ML recommendations');
    }

    logger.info(`Successfully got ${result.recommendations.length} ML recommendations`);
    return result.recommendations;
  } catch (error) {
    logger.error('Error getting ML recommendations, will fall back to JS:', error);
    throw error; // Let the caller handle the fallback
  }
};

/**
 * Get similar properties to a specific property
 * @param {String} propertyId - The ID of the property to find similar properties for
 * @param {Array} allProperties - All available properties
 * @param {Number} limit - Maximum number of similar properties to return
 * @returns {Promise<Array>} - Array of similar property IDs
 */
const getSimilarProperties = async (propertyId, allProperties, limit = 5) => {
  try {
    logger.info(`Getting similar properties for property ID: ${propertyId}`);
    
    // Sanitize property data
    const sanitizedProperties = sanitizePropertyData(allProperties);
    
    const result = await callPythonRecommendationEngine({
      mode: 'similar_properties',
      property_id: propertyId,
      all_properties: sanitizedProperties,
      limit
    });

    if (!result.success) {
      logger.error(`Failed to get similar properties: ${result.error || 'Unknown error'}`);
      throw new Error(result.error || 'Failed to get similar properties');
    }

    logger.info(`Successfully got ${result.similar_properties.length} similar properties`);
    return result.similar_properties;
  } catch (error) {
    logger.error('Error getting similar properties:', error);
    return [];
  }
};

module.exports = {
  getUserRecommendations,
  getSimilarProperties
};