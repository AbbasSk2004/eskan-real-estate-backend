const express = require('express');
const router = express.Router();
const axios = require('axios');

// Environment variables - check both backend and frontend keys
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || process.env.REACT_APP_GOOGLE_MAPS_API_KEY;

// Log API key info only once during module initialization
if (process.env.NODE_ENV === 'production') {
  console.log('Maps Route: Environment Check', {
    NODE_ENV: process.env.NODE_ENV,
    hasBackendKey: !!process.env.GOOGLE_MAPS_API_KEY,
    hasFrontendKey: !!process.env.REACT_APP_GOOGLE_MAPS_API_KEY,
    finalKeyLength: GOOGLE_MAPS_API_KEY?.length,
    keyStartsWith: GOOGLE_MAPS_API_KEY?.substring(0, 8)
  });
}

// Simple API key format validation
const validateApiKey = (req, res, next) => {
  if (!GOOGLE_MAPS_API_KEY) {
    return res.status(500).json({
      success: false,
      error: 'Google Maps API key is not configured',
      details: 'API key is missing in environment variables'
    });
  }

  if (!GOOGLE_MAPS_API_KEY.startsWith('AIza')) {
    return res.status(500).json({
      success: false,
      error: 'Invalid Google Maps API key format',
      details: 'API key must start with "AIza"'
    });
  }

  next();
};

// Helper function to make HTTP requests with retries
const fetchWithRetry = async (url, options = {}, maxRetries = 2) => {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await axios({
        ...options,
        url,
        timeout: 15000, // Reduced timeout
        maxRedirects: 3, // Reduced redirects
        validateStatus: (status) => status < 500, // Accept 4xx errors
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ESKAN-Real-Estate/1.0)',
          'Accept': 'application/json,text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
          'Connection': 'keep-alive',
          ...options.headers
        }
      });

      // Check if we hit Google's anti-bot page
      if (response.data?.includes?.('sorry/index') || response.request?.res?.responseUrl?.includes('sorry/index')) {
        throw new Error('Hit Google anti-bot protection');
      }

      return response;
    } catch (error) {
      console.error(`Attempt ${i + 1} failed:`, error.message);
      lastError = error;
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
  }
  
  throw lastError;
};

// Helper function to extract coordinates from iframe embed URL
function extractCoordinatesFromIframe(url) {
  try {
    // Extract the src URL if it's an iframe
    if (url.includes('<iframe')) {
      const srcMatch = url.match(/src="([^"]+)"/);
      if (srcMatch) {
        url = decodeURIComponent(srcMatch[1]);
      }
    }

    // Extract coordinates from pb parameter
    const pbMatch = url.match(/!2d(-?\d+\.\d+)!3d(-?\d+\.\d+)/);
    if (pbMatch) {
      return {
        lat: parseFloat(pbMatch[2]),
        lng: parseFloat(pbMatch[1])
      };
    }

    // Extract center coordinates
    const centerMatch = url.match(/!3d(-?\d+\.\d+)!2d(-?\d+\.\d+)/);
    if (centerMatch) {
      return {
        lat: parseFloat(centerMatch[1]),
        lng: parseFloat(centerMatch[2])
      };
    }

    return null;
  } catch (error) {
    console.error('Error extracting coordinates from iframe:', error);
    return null;
  }
}

// Helper function to extract coordinates from a URL
async function extractCoordinatesFromUrl(url) {
  // Skip Google Maps short URLs (e.g., maps.app.goo.gl)
  // We no longer follow redirects for these links; caller should supply
  // a full Google Maps URL or an embed iframe URL instead.
  if (url.includes('maps.app.goo.gl') || url.includes('goo.gl/maps')) {
    return null; // early-exit so that downstream patterns are not attempted
  }

  // Pattern 1: @lat,lng format
  let match = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (match) {
    const coords = {
      lat: parseFloat(match[1]),
      lng: parseFloat(match[2])
    };
    // console.log('Found coordinates using @lat,lng pattern:', coords);
    return coords;
  }

  // Pattern 2: ll=lat,lng format
  match = url.match(/ll=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (match) {
    const coords = {
      lat: parseFloat(match[1]),
      lng: parseFloat(match[2])
    };
    // console.log('Found coordinates using ll=lat,lng pattern:', coords);
    return coords;
  }

  // Pattern 3: q=lat,lng format
  match = url.match(/[?&](?:q|query)=(?:loc:)?(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (match) {
    const coords = {
      lat: parseFloat(match[1]),
      lng: parseFloat(match[2])
    };
    // console.log('Found coordinates using q=lat,lng pattern:', coords);
    return coords;
  }

  // Pattern 4: data=!3m1!4b1!4m5!3m4!1m0!1m2!1d{lng}!2d{lat} format
  match = url.match(/!2d(-?\d+\.\d+)!3d(-?\d+\.\d+)/);
  if (match) {
    const coords = {
      lat: parseFloat(match[2]),
      lng: parseFloat(match[1])
    };
    // console.log('Found coordinates using data= pattern:', coords);
    return coords;
  }

  // Pattern 5: Generic lat,lng search anywhere in URL
  // Matches first occurrence of two decimal numbers separated by a comma (or URL-encoded comma)
  match = url.match(/(-?\d{1,3}\.\d+)[ ,%2C]+(-?\d{1,3}\.\d+)/);
  if (match) {
    const possibleLat = parseFloat(match[1]);
    const possibleLng = parseFloat(match[2]);
    // Basic sanity check on latitude/longitude ranges
    if (Math.abs(possibleLat) <= 90 && Math.abs(possibleLng) <= 180) {
      const coords = { lat: possibleLat, lng: possibleLng };
      // console.log('Found coordinates using generic pattern:', coords);
      return coords;
    }
  }

  // Pattern 5: Extract from place name in URL
  if (url.includes('/place/')) {
    try {
      // console.log('Attempting to geocode place name from URL');
      const placeName = url.split('/place/')[1].split('/')[0];
      if (placeName) {
        const decodedPlaceName = decodeURIComponent(placeName).replace(/\+/g, ' ');
        // console.log('Geocoding place name:', decodedPlaceName);
        
        const geocodeResponse = await fetchWithRetry(
          `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(decodedPlaceName)}&key=${GOOGLE_MAPS_API_KEY}`
        );
        
        if (geocodeResponse.data?.results?.[0]?.geometry?.location) {
          const coords = geocodeResponse.data.results[0].geometry.location;
          // console.log('Found coordinates through geocoding:', coords);
          return coords;
        }
      }
    } catch (error) {
      console.error('Error geocoding place name:', error);
    }
  }

  return null;
}

// Extract coordinates from Google Maps URL - GET only
router.get('/extract-coordinates', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) {
      return res.status(400).json({ 
        success: false, 
        error: 'URL is required' 
      });
    }

    // console.log('Processing URL:', url);

    // First try to extract from iframe if it's an embed code
    if (url.includes('<iframe')) {
      const iframeCoords = extractCoordinatesFromIframe(url);
      if (iframeCoords) {
        // console.log('Successfully extracted coordinates from iframe:', iframeCoords);
        return res.json({
          success: true,
          data: iframeCoords
        });
      }
    }

    // Try normal URL extraction
    let coords = await extractCoordinatesFromUrl(url);
    
    if (coords) {
      // console.log('Successfully extracted coordinates:', coords);
      return res.json({
        success: true,
        data: coords
      });
    }

    // If all attempts fail, try using the Places API as last resort
    try {
      const placeResponse = await fetchWithRetry(
        `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(url)}&inputtype=textquery&fields=geometry&key=${GOOGLE_MAPS_API_KEY}`
      );

      if (placeResponse.data?.candidates?.[0]?.geometry?.location) {
        coords = placeResponse.data.candidates[0].geometry.location;
        // console.log('Found coordinates using Places API:', coords);
        return res.json({
          success: true,
          data: coords
        });
      }
    } catch (error) {
      console.error('Error using Places API:', error);
    }

    return res.status(400).json({
      success: false,
      error: 'Could not extract coordinates from URL'
    });
  } catch (error) {
    console.error('Error in extract-coordinates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process URL',
      details: error.message
    });
  }
});

// Geocode an address to coordinates - GET only
router.get('/geocode', validateApiKey, async (req, res) => {
  try {
    const { address } = req.query;
    if (!address) {
      return res.status(400).json({ 
        success: false, 
        error: 'Address is required',
        details: 'No address provided in query parameters'
      });
    }

    // console.log('Attempting to geocode address:', address);

    const response = await fetchWithRetry(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}`
    );

    // console.log('Geocoding response status:', response.data.status);
    
    if (response.data.status === 'OK') {
      const location = response.data.results[0].geometry.location;
      // console.log('Successfully geocoded address:', location);
      res.json({
        success: true,
        data: location
      });
    } else if (response.data.status === 'REQUEST_DENIED') {
      console.error('Geocoding request denied:', response.data.error_message);
      res.status(400).json({
        success: false,
        error: 'Could not geocode address: API request denied',
        details: response.data.error_message
      });
    } else if (response.data.status === 'ZERO_RESULTS') {
      console.warn('No results found for address:', address);
      res.status(400).json({
        success: false,
        error: 'No results found for the provided address',
        details: 'The address could not be geocoded'
      });
    } else {
      console.error('Geocoding failed with status:', response.data.status);
      res.status(400).json({
        success: false,
        error: `Geocoding failed: ${response.data.status}`,
        details: response.data.error_message || 'Unknown error occurred'
      });
    }
  } catch (error) {
    console.error('Geocoding error:', error.response?.data || error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.response?.data?.error_message || error.message
    });
  }
});

// Reverse geocode coordinates to address
router.get('/reverse-geocode', validateApiKey, async (req, res) => {
  try {
    const { lat, lng } = req.query;
    if (!lat || !lng) {
      return res.status(400).json({ 
        success: false,
        error: 'Latitude and longitude are required' 
      });
    }

    const response = await fetchWithRetry(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}`
    );

    if (response.data.status === 'OK') {
      res.json({
        success: true,
        data: response.data.results[0].formatted_address
      });
    } else if (response.data.status === 'REQUEST_DENIED') {
      res.status(400).json({
        success: false,
        error: 'Could not reverse geocode: API request denied',
        details: response.data.error_message
      });
    } else {
      res.status(400).json({
        success: false,
        error: `Reverse geocoding failed: ${response.data.status}`
      });
    }
  } catch (error) {
    console.error('Reverse geocoding error:', error.response?.data || error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Health check endpoint to test API key
router.get('/health', validateApiKey, async (req, res) => {
  try {
    const testResponse = await fetchWithRetry(
      `https://maps.googleapis.com/maps/api/geocode/json?address=test&key=${GOOGLE_MAPS_API_KEY}`
    );

    if (testResponse.data.status === 'REQUEST_DENIED') {
      return res.status(401).json({
        success: false,
        error: 'Invalid Google Maps API key or API key not authorized for this service',
        details: testResponse.data.error_message
      });
    }

    res.json({
      success: true,
      message: 'Google Maps API key is valid and working'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to validate Google Maps API key',
      details: error.response?.data?.error_message || error.message
    });
  }
});

module.exports = router; 