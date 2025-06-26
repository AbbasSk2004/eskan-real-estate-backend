require('dotenv').config();

const config = {
  firebase: {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
    measurementId: process.env.FIREBASE_MEASUREMENT_ID
  },
  
  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY
  },
  
  google: {
    mapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
    clientId: process.env.GOOGLE_CLIENT_ID,
    redirectUri: process.env.GOOGLE_REDIRECT_URI
  },
  
  api: {
    port: process.env.PORT || 3001,
    nodeEnv: process.env.NODE_ENV || 'development',
    baseUrl: process.env.API_BASE_URL || 'http://localhost:3001/api',
    wsUrl: process.env.WS_URL || 'ws://localhost:3001'
  },
  
  features: {
    enableAnalytics: process.env.ENABLE_ANALYTICS === 'true',
    enableMapSearch: process.env.ENABLE_MAP_SEARCH === 'true',
    enableSocialSharing: process.env.ENABLE_SOCIAL_SHARING === 'true',
    enableLazyLoading: process.env.ENABLE_LAZY_LOADING === 'true',
    enableImageOptimization: process.env.ENABLE_IMAGE_OPTIMIZATION === 'true',
    enableSearchSuggestions: process.env.ENABLE_SEARCH_SUGGESTIONS === 'true',
    enableSavedSearches: process.env.ENABLE_SAVED_SEARCHES === 'true',
    debugAuth: process.env.DEBUG_AUTH === 'true'
  },
  
  upload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760,
    maxFilesCount: parseInt(process.env.MAX_FILES_COUNT) || 10
  },
  
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET,
    refreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '30d'
  }
};

// Validate required environment variables
const requiredEnvVars = [
  'FIREBASE_API_KEY',
  'FIREBASE_AUTH_DOMAIN',
  'FIREBASE_PROJECT_ID',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'GOOGLE_MAPS_API_KEY',
  'JWT_SECRET',
  'REFRESH_TOKEN_SECRET'
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
}

module.exports = config; 