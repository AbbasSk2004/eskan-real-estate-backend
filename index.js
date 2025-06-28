// Dependencies
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');
const logger = require('./utils/logger');
const setupGlobalErrorHandlers = require('./utils/errorHandlers');
setupGlobalErrorHandlers();
const { uploadToSupabaseStorage } = require('./utils/storage');
const morgan = require('morgan');
const helmet = require('helmet');
const compression = require('compression');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Import routes
const agentRoutes = require('./routes/agents');
const testimonialRoutes = require('./routes/testimonials');
const notificationRoutes = require('./routes/notifications');
const contactRoutes = require('./routes/contact');
const propertyRoutes = require('./routes/properties');
const propertyViewsRoutes = require('./routes/property-views');
const propertyInquiryRoutes = require('./routes/property_inquiry');
const chatRoutes = require('./routes/chat');
const favoriteRoutes = require('./routes/favorites');
const profileRoutes = require('./routes/profile');
const authRoutes = require('./routes/auth');
const mapsRouter = require('./routes/maps');
const faqRoutes = require('./routes/faq');
const blogRoutes = require('./routes/blogs');
const similarPropertiesRoutes = require('./routes/similar-properties');

// Validate required environment variables
const requiredEnvVars = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY',
  'FRONTEND_URL'
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  logger.error('Missing required environment variables:', missingEnvVars);
  process.exit(1);
}

const session = require('express-session');

// Initialize Express app
const app = express();

// Trust only the first proxy in production to satisfy express-rate-limit validation
app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : false);

// Security middleware with correct configuration for frontend
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Parse FRONTEND_URL to handle multiple origins
const parseOrigins = (originsString) => {
  if (!originsString) return 'http://localhost:8081';
  
  try {
    // Check if it's JSON array format
    if (originsString.startsWith('[')) {
      return JSON.parse(originsString);
    }
    // Otherwise split by comma and trim
    return originsString.split(',').map(url => url.trim());
  } catch (error) {
    logger.warn('Failed to parse FRONTEND_URL, falling back to default', error);
    return 'http://localhost:8081';
  }
};

const allowedOrigins = parseOrigins(process.env.FRONTEND_URL);

// CORS configuration
const corsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? [
        'https://eskan-real-estate.vercel.app', // Vercel's default domain
        /\.vercel\.app$/, // Any Vercel preview deployments
        'https://eskan-real-estate-react.vercel.app', // React website
        'http://localhost:3000', // Development website
        ...allowedOrigins // Mobile app URLs from FRONTEND_URL
      ]
    : ['http://localhost:3000', 'exp://localhost:8081', 'http://localhost:8081'], // Development
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Refresh-Token']
};

app.use(cors(corsOptions));

// Add session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 1 day
  }
}));

// Compression middleware
app.use(compression());

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Authentication middleware
const getUserFromToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const refreshToken = req.headers['x-refresh-token'];
    
    if (!token) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'No authentication token provided'
      });
    }

    let { data: { user }, error } = await supabase.auth.getUser(token);

    // If token is invalid and we have a refresh token, try to refresh
    if (error?.status === 401 && refreshToken) {
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession({
        refresh_token: refreshToken
      });

      if (refreshError) {
        logger.error('Token refresh error:', {
          error: refreshError.message,
          code: refreshError.code
        });
        return res.status(401).json({
          error: 'refresh_failed',
          message: 'Failed to refresh authentication token'
        });
      }

      if (refreshData?.session) {
        // Set new tokens in response headers
        res.set({
          'X-New-Access-Token': refreshData.session.access_token,
          'X-New-Refresh-Token': refreshData.session.refresh_token
        });
        // Get user with new token
        const { data: { user: refreshedUser }, error: userError } = await supabase.auth.getUser(refreshData.session.access_token);
        if (!userError) {
          user = refreshedUser;
          error = null;
        }
      }
    }

    if (error) {
      logger.error('Token verification error:', {
        error: error.message,
        code: error.code
      });

      if (error.status === 401) {
        return res.status(401).json({
          error: 'invalid_token',
          message: 'Invalid or expired token'
        });
      }

      return res.status(500).json({
        error: 'auth_error',
        message: 'Failed to verify authentication token'
      });
    }

    if (!user) {
      return res.status(401).json({
        error: 'invalid_token',
        message: 'Invalid authentication token'
      });
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('profiles_id', user.id)
      .single();

    if (profileError && profileError.code !== 'PGRST116') {
      logger.error('Profile fetch error in middleware:', {
        error: profileError.message,
        userId: user.id
      });
      
      return res.status(500).json({
        error: 'profile_error',
        message: 'Failed to fetch user profile'
      });
    }

    // Attach user and profile to request
    req.user = user;
    req.profile = profile;
    
    next();
  } catch (err) {
    logger.error('Auth middleware error:', {
      error: err.message,
      stack: err.stack
    });
    
    res.status(500).json({
      error: 'server_error',
      message: 'An unexpected error occurred while verifying authentication'
    });
  }
};

// Optional authentication middleware
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return next();
    }

    let { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return next();
    }

    // Get user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('profiles_id', user.id)
      .single();

    // Attach user and profile to request if found
    req.user = user;
    req.profile = profile;
    
    next();
  } catch (err) {
    // On any error, just proceed without authentication
    next();
  }
};

// Verify Supabase connection
async function verifySupabaseConnection() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    logger.info('✅ Supabase connection successful');
    logger.info('✅ Database connected');
    logger.info('✅ Supabase key verified');
    return true;
  } catch (err) {
    logger.error('❌ Supabase connection error:', err);
    return false;
  }
}

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: {
    fileSize: process.env.MAX_FILE_SIZE || 10 * 1024 * 1024, // 10MB default
    files: process.env.MAX_FILES_COUNT || 10
  }
});

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/profile', (req, res, next) => {
  // Ensure Authorization header is present
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'No authorization token provided'
    });
  }
  next();
}, profileRoutes);
app.use('/api/properties', optionalAuth, propertyRoutes);
app.use('/api/typepage', require('./routes/typepage'));
app.use('/api/property-views', propertyViewsRoutes);
app.use('/api/property-inquiries', getUserFromToken, propertyInquiryRoutes);
app.use('/api/similar-properties', similarPropertiesRoutes);
app.use('/api/agents', optionalAuth, agentRoutes);
app.use('/api/testimonials', optionalAuth, testimonialRoutes);
app.use('/api/notifications', getUserFromToken, notificationRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/chat', getUserFromToken, chatRoutes);
app.use('/api/favorites', getUserFromToken, favoriteRoutes);
app.use('/api/maps', mapsRouter);
app.use('/api/faqs', faqRoutes);
app.use('/api/blogs', blogRoutes);

// Rate limiting (production only)
if (process.env.NODE_ENV === 'production') {
  const rateLimit = require('express-rate-limit');
  app.use(rateLimit({
    windowMs: process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000,
    max: process.env.RATE_LIMIT_MAX_REQUESTS || 100,
    validate: { xForwardedForHeader: false }
  }));
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// Connection check endpoint
app.get('/api/auth/check-connection', async (req, res) => {
  try {
    // Test database connection
    const { error } = await supabase
      .from('profiles')
      .select('count', { count: 'exact', head: true });

    if (error) {
      logger.error('Database connection check failed:', error);
      return res.status(500).json({ 
        status: 'error',
        message: 'Database connection failed',
        checks: {
          supabase_url: !!process.env.SUPABASE_URL,
          supabase_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
          supabase_anon_key: !!process.env.SUPABASE_ANON_KEY,
          database_connection: false,
          error: error.message
        }
      });
    }

    res.json({ 
      status: 'success',
      message: 'All connections verified successfully',
      checks: {
        supabase_url: !!process.env.SUPABASE_URL,
        supabase_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        supabase_anon_key: !!process.env.SUPABASE_ANON_KEY,
        database_connection: true,
        google_api_key: !!process.env.GOOGLE_MAPS_API_KEY
      },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    logger.error('API connection check failed:', err);
    res.status(500).json({
      status: 'error',
      message: 'API connection check failed',
      error: err.message,
      checks: {
        supabase_url: !!process.env.SUPABASE_URL,
        supabase_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        supabase_anon_key: !!process.env.SUPABASE_ANON_KEY,
        database_connection: false
      }
    });
  }
});

// Register endpoint
app.post('/api/auth/register', async (req, res) => {
  const { email, password, firstName, lastName, phone } = req.body;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { firstName, lastName, phone }
    }
  });
  if (error) return res.status(400).json({ message: error.message });

  // Insert into profiles table
  const userId = data.user.id;
  const { error: profileError } = await supabase
    .from('profiles')
    .insert([{ id: userId, first_name: firstName, last_name: lastName, email, phone }]);
  if (profileError) return res.status(400).json({ message: profileError.message });

  res.status(201).json({ user: data.user, message: 'Registration successful. Please verify your email.' });
});

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'Email and password are required'
      });
    }

    // Attempt to sign in with Supabase auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (authError) {
      logger.error('Login error:', {
        error: authError.message,
        code: authError.code,
        email
      });

      // Handle specific error cases
      if (authError.message.includes('Invalid credentials')) {
        return res.status(401).json({
          error: 'invalid_credentials',
          message: 'Invalid email or password'
        });
      }

      if (authError.message.includes('Email not confirmed')) {
        return res.status(401).json({
          error: 'email_not_verified',
          message: 'Please verify your email before logging in'
        });
      }

      return res.status(401).json({
        error: 'auth_error',
        message: authError.message
      });
    }

    if (!authData?.user || !authData?.session) {
      return res.status(500).json({
        error: 'invalid_response',
        message: 'Invalid response from authentication server'
      });
    }

    // Get user profile from our profiles table with all fields
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select(`
        id,
        profiles_id,
        firstname,
        lastname,
        email,
        profile_photo,
        phone,
        role,
        is_featured,
        status,
        created_at,
        updated_at
      `)
      .eq('profiles_id', authData.user.id)
      .single();

    if (profileError && profileError.code !== 'PGRST116') { // PGRST116 = no rows found
      logger.error('Profile fetch error:', {
        error: profileError.message,
        userId: authData.user.id
      });
      return res.status(500).json({
        error: 'profile_fetch_error',
        message: 'Failed to fetch user profile'
      });
    }

    let profile = profileData;
    
    if (!profile) {
      // If no profile exists, create one with all fields
      const { data: newProfile, error: createProfileError } = await supabase
        .from('profiles')
        .insert([{
          profiles_id: authData.user.id,
          email: authData.user.email,
          firstname: authData.user.user_metadata?.first_name || '',
          lastname: authData.user.user_metadata?.last_name || '',
          role: 'user',
          status: 'active',
          is_featured: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (createProfileError) {
        logger.error('Profile creation error:', {
          error: createProfileError.message,
          userId: authData.user.id
        });
        return res.status(500).json({
          error: 'profile_creation_error',
          message: 'Failed to create user profile'
        });
      }

      profile = newProfile;
    }

    // Return success response with session and complete user/profile data
    res.json({
      session: {
        access_token: authData.session.access_token,
        refresh_token: authData.session.refresh_token,
        expires_at: authData.session.expires_at
      },
      user: {
        id: authData.user.id,
        email: authData.user.email,
        profile: {
          ...profile,
          firstname: profile.firstname || '',
          lastname: profile.lastname || '',
          email: profile.email || authData.user.email,
          profile_photo: profile.profile_photo || authData.user.user_metadata?.avatar_url,
          phone: profile.phone || '',
          role: profile.role || 'user',
          status: profile.status || 'active',
          is_featured: profile.is_featured || false
        }
      }
    });

  } catch (err) {
    logger.error('Unhandled login error:', {
      error: err.message,
      stack: err.stack
    });
    
    res.status(500).json({
      error: 'server_error',
      message: 'An unexpected error occurred during login'
    });
  }
});

// Get all properties
app.get('/api/properties', async (req, res) => {
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
      bedrooms,
      bathrooms,
      sortBy = 'created_at'
    } = req.query;

    // Build the base query with only necessary fields
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
        city,
        governate,
        main_image,
        created_at,
        profiles:profiles!properties_profiles_id_fkey (
          firstname,
          lastname,
          profile_photo
        )
      `, { count: 'exact' });

    // Apply filters using an array to build the query dynamically
    const filters = [];
    const values = {};
    let filterCount = 0;

    if (status && status !== 'all') {
      filters.push(`status.eq.${status}`);
    }

    if (propertyType) {
      filters.push(`property_type.eq.${propertyType}`);
    }

    if (governorate) {
      filters.push(`governate.eq.${governorate}`);
    }

    if (city) {
      filters.push(`city.eq.${city}`);
    }

    if (priceMin) {
      filters.push(`price.gte.${parseFloat(priceMin)}`);
    }

    if (priceMax) {
      filters.push(`price.lte.${parseFloat(priceMax)}`);
    }

    if (areaMin) {
      filters.push(`area.gte.${parseFloat(areaMin)}`);
    }

    if (areaMax) {
      filters.push(`area.lte.${parseFloat(areaMax)}`);
    }

    if (bedrooms) {
      filters.push(`bedrooms.gte.${parseInt(bedrooms)}`);
    }

    if (bathrooms) {
      filters.push(`bathrooms.gte.${parseInt(bathrooms)}`);
    }

    // Apply text search if keyword is provided
    if (keyword) {
      query = query.textSearch('title', keyword, {
        type: 'websearch',
        config: 'english'
      });
    }

    // Apply filters
    if (filters.length > 0) {
      query = query.or(filters.join(','));
    }

    // Add sorting
    if (sortBy === 'newest') {
      query = query.order('created_at', { ascending: false });
    } else if (sortBy === 'price_low') {
      query = query.order('price', { ascending: true });
    } else if (sortBy === 'price_high') {
      query = query.order('price', { ascending: false });
    } else if (sortBy === 'area_low') {
      query = query.order('area', { ascending: true });
    } else if (sortBy === 'area_high') {
      query = query.order('area', { ascending: false });
    }

    // Add pagination
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    // Execute query with timeout
    const { data, error, count } = await Promise.race([
      query,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Query timeout')), 14000)
      )
    ]);

    if (error) {
      console.error('Supabase query error:', error);
      return res.status(400).json({ message: error.message });
    }

    // Process features for each property
    const processedData = data.map(property => ({
      ...property,
      features: property.features || {}
    }));

    // Calculate pagination info
    const totalPages = Math.ceil(count / pageSize);

    // Cache the response for 5 minutes
    res.set('Cache-Control', 'public, max-age=300');
    
    res.json({
      properties: processedData,
      currentPage: parseInt(page),
      totalPages,
      totalCount: count,
      pageSize: parseInt(pageSize)
    });
  } catch (err) {
    logger.error('Property search error:', {
      error: err.message,
      stack: err.stack,
      query: req.query
    });
    res.status(500).json({ message: 'An error occurred while searching properties' });
  }
});

// Add a new property
app.post('/api/properties', getUserFromToken, upload.fields([
  { name: 'mainImage', maxCount: 1 },
  { name: 'additionalImages', maxCount: 10 }
]), async (req, res) => {
  try {
    const fields = req.body;

    // Validate required fields
    const requiredFields = ['propertyTitle', 'propertyType', 'price', 'governorate', 'city', 'address', 'description'];
    const missingFields = requiredFields.filter(field => !fields[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        error: 'validation_error',
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    // Validate price
    const price = parseFloat(fields.price.replace(/,/g, ''));
    if (isNaN(price) || price <= 0) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'Price must be a valid positive number'
      });
    }

    // Upload main image if provided
    let mainImageUrl = null;
    if (req.files['mainImage'] && req.files['mainImage'][0]) {
      try {
        const file = req.files['mainImage'][0];
        const path = `properties/main/${Date.now()}_${file.originalname}`;
        mainImageUrl = await uploadToSupabaseStorage(file, 'property-images', path);
      } catch (uploadError) {
        logger.error('Main image upload error:', uploadError);
        return res.status(500).json({
          error: 'upload_error',
          message: 'Failed to upload main image'
        });
      }
    }

    // Upload additional images if provided
    let imageUrls = [];
    if (req.files['additionalImages']) {
      try {
        for (const file of req.files['additionalImages']) {
          const path = `properties/additional/${Date.now()}_${file.originalname}`;
          const url = await uploadToSupabaseStorage(file, 'property-images', path);
          imageUrls.push(url);
        }
      } catch (uploadError) {
        logger.error('Additional images upload error:', uploadError);
        return res.status(500).json({
          error: 'upload_error',
          message: 'Failed to upload additional images'
        });
      }
    }

    // Parse features
    let features = {};
    try {
      features = fields.features ? JSON.parse(fields.features) : {};
    } catch (parseError) {
      logger.error('Features parsing error:', parseError);
      return res.status(400).json({
        error: 'validation_error',
        message: 'Invalid features format'
      });
    }

    // Prepare property object
    const property = {
      title: fields.propertyTitle,
      property_type: fields.propertyType,
      description: fields.description,
      price: price,
      governate: fields.governorate,
      city: fields.city,
      address: fields.address,
      bedrooms: fields.bedrooms ? parseInt(fields.bedrooms) : null,
      bathrooms: fields.bathrooms ? parseInt(fields.bathrooms) : null,
      area: fields.area ? parseFloat(fields.area) : null,
      features: features,
      main_image: mainImageUrl,
      images: imageUrls.length > 0 ? imageUrls : null,
      profiles_id: req.user.id,
      status: fields.status || 'available',
      location_url: fields.location_url || null,
      village: fields.village || null,
      livingrooms: fields.livingrooms ? parseInt(fields.livingrooms) : null,
      floor: fields.floor ? parseInt(fields.floor) : null,
      year_built: fields.yearBuilt ? parseInt(fields.yearBuilt) : null,
      garden_area: fields.garden_area ? parseFloat(fields.garden_area) : null
    };

    // Remove null/undefined values
    Object.keys(property).forEach(key => {
      if (property[key] === null || property[key] === undefined) {
        delete property[key];
      }
    });

    // Insert into database
    const { data, error } = await supabase
      .from('properties')
      .insert([property])
      .select()
      .single();

    if (error) {
      logger.error('Database insert error:', error);
      return res.status(400).json({
        error: 'database_error',
        message: 'Failed to save property to database',
        details: error.message
      });
    }

    // Return success response
    res.status(201).json({
      message: 'Property created successfully',
      property: data
    });

  } catch (err) {
    logger.error('Property creation error:', err);
    res.status(500).json({
      error: 'server_error',
      message: 'An unexpected error occurred while creating the property',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Get all agents with filtering - UPDATED
app.get('/api/agents', async (req, res) => {
  try {
    const { name, specialty, experience } = req.query;
    
    logger.info('Agent search request:', { 
      filters: { name, specialty, experience },
      timestamp: new Date().toISOString()
    });

    // Start with base query for approved agents
    let query = supabase
      .from('agents')
      .select(`
        id,
        profiles_id,
        specialty,
        experience,
        about_me,
        facebook_url,
        twitter_url,
        instagram_url,
        phone,
        image,
        is_featured,
        profiles:profiles_id (
          firstname,
          lastname,
          email,
          profile_photo
        )
      `)
      .eq('status', 'approved')
      .eq('approved', true);

    // Log the query for debugging
    logger.debug('Agent query:', query);

    // Execute query with timeout
    const { data: agents, error } = await Promise.race([
      query.order('is_featured', { ascending: false })
           .order('created_at', { ascending: false }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Query timeout')), 10000)
      )
    ]);

    if (error) {
      logger.error('Database error:', {
        error: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      });
      return res.status(400).json({
        success: false,
        message: 'Failed to fetch agents',
        error: error.message
      });
    }

    let filteredAgents = agents || [];
    logger.debug('Raw agents data:', filteredAgents);

    // Transform data to match frontend expectations
    const transformedAgents = filteredAgents.map(agent => ({
      id: agent.id,
      profiles_id: agent.profiles_id,
      specialty: agent.specialty,
      experience: agent.experience,
      about_me: agent.about_me,
      facebook_url: agent.facebook_url,
      twitter_url: agent.twitter_url,
      instagram_url: agent.instagram_url,
      phone: agent.phone,
      image: agent.image,
      is_featured: agent.is_featured,
      profiles: {
        firstname: agent.profiles?.firstname,
        lastname: agent.profiles?.lastname,
        email: agent.profiles?.email,
        profile_photo: agent.profiles?.profile_photo
      }
    }));

    logger.info(`Found ${transformedAgents.length} agents matching criteria`);

    // Cache the response for 1 minute
    res.set('Cache-Control', 'public, max-age=60');

    res.json({
      success: true,
      message: 'Agents fetched successfully',
      data: transformedAgents
    });

  } catch (err) {
    logger.error('Error fetching agents:', {
      error: err.message,
      stack: err.stack,
      type: err.name
    });
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: err.message
    });
  }
});

// Add debug endpoint
app.get('/api/debug/agents', async (req, res) => {
  try {
    // Check profiles
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*')
      .limit(5);

    // Check agents
    const { data: agents, error: agentsError } = await supabase
      .from('agents')
      .select('*')
      .limit(5);

    // Check joined data
    const { data: joinedData, error: joinedError } = await supabase
      .from('agents')
      .select(`
        id,
        profiles_id,
        specialty,
        experience,
        status,
        approved,
        profiles!inner (
          firstname,
          lastname,
          email
        )
      `)
      .limit(5);

    res.json({
      profiles: { data: profiles, error: profilesError },
      agents: { data: agents, error: agentsError },
      joined: { data: joinedData, error: joinedError }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get featured agents
app.get('/api/agents/featured', async (req, res) => {
  try {
    // Use the optimized function for featured agents
    const { data: agents, error } = await supabase
      .rpc('get_featured_agents');

    if (error) {
      logger.error('Database error:', error);
      return res.status(400).json({
        success: false,
        message: 'Failed to fetch featured agents',
        error: error.message
      });
    }

    // Cache the response for 5 minutes since featured agents don't change often
    res.set('Cache-Control', 'public, max-age=300');

    res.json({
      success: true,
      message: 'Featured agents fetched successfully',
      data: agents || []
    });

  } catch (err) {
    logger.error('Error fetching featured agents:', err);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: err.message
    });
  }
});

// Get agent by ID
app.get('/api/agents/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: agent, error } = await supabase
      .from('agents')
      .select(`
        id,
        profiles_id,
        specialty,
        experience,
        about_me,
        facebook_url,
        twitter_url,
        instagram_url,
        phone,
        image,
        is_featured,
        profiles!inner (
          firstname,
          lastname,
          email,
          profile_photo
        )
      `)
      .eq('id', id)
      .eq('status', 'approved')
      .eq('approved', true)
      .single();

    if (error) {
      logger.error('Database error:', error);
      return res.status(404).json({
        success: false,
        message: 'Agent not found',
        error: error.message
      });
    }

    // Cache individual agent responses for 5 minutes
    res.set('Cache-Control', 'public, max-age=300');

    res.json({
      success: true,
      message: 'Agent fetched successfully',
      data: agent
    });

  } catch (err) {
    logger.error('Error fetching agent:', err);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: err.message
    });
  }
});

// Auth verify endpoint
app.get('/api/auth/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ 
        success: false,
        error: 'unauthorized',
        message: 'No token provided' 
      });
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error) {
      logger.error('Token verification error:', {
        error: error.message,
        code: error.code
      });
      return res.status(401).json({ 
        success: false,
        error: 'invalid_token',
        message: error.message 
      });
    }

    if (!user) {
      return res.status(401).json({ 
        success: false,
        error: 'invalid_token',
        message: 'Invalid token' 
      });
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('profiles_id', user.id)
      .single();

    if (profileError && profileError.code !== 'PGRST116') {
      logger.error('Profile fetch error:', {
        error: profileError.message,
        userId: user.id
      });
      return res.status(500).json({ 
        success: false,
        error: 'profile_error',
        message: 'Failed to fetch user profile' 
      });
    }

    res.json({ 
      success: true,
      user: { 
        ...user,
        profile: profile || null
      }
    });
  } catch (err) {
    logger.error('Auth verify error:', {
      error: err.message,
      stack: err.stack
    });
    res.status(500).json({ 
      success: false,
      error: 'server_error',
      message: 'An unexpected error occurred while verifying authentication' 
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    userId: req.user?.id
  });

  // Handle specific error types
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Validation Error',
      errors: err.errors
    });
  }

  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized Access'
    });
  }

  // Default error response
  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal Server Error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Start server
const PORT = process.env.PORT || 3001;

// Start server with connection validation
async function startServer() {
  try {
    const isConnected = await verifySupabaseConnection();
    
    if (!isConnected) {
      logger.error('Failed to connect to Supabase. Server will not start.');
      process.exit(1);
    }

    const server = app.listen(PORT, () => {
      logger.info('Environment Variables:');
      logger.info('✅ SUPABASE_URL is set');
      logger.info('✅ SUPABASE_SERVICE_ROLE_KEY is set');
      logger.info('✅ SUPABASE_ANON_KEY is set');
      logger.info('✅ FRONTEND_URL is set');
      logger.info(`✅ Server started successfully on http://localhost:${PORT}/api`);

      // Initialise WebSocket server once the HTTP server is ready
      try {
        const { setupWebSocket } = require('./websocket');
        setupWebSocket(server);
      } catch (wsErr) {
        logger.error('Failed to initialise WebSocket server:', wsErr);
      }
    });
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION! 💥 Shutting down...');
  console.error(err.name, err.message);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
  console.error(err.name, err.message);
  process.exit(1);
});

// Helper function to handle new user creation from OAuth providers
async function createUserProfileFromOAuth(user) {
  try {
    if (!user || !user.id) {
      throw new Error('Invalid user data provided');
    }

    // Extract name from user metadata
    const fullName = user.user_metadata?.full_name || '';
    const nameParts = fullName.split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    logger.debug('Creating profile for user:', { 
      id: user.id,
      email: user.email,
      firstName,
      lastName
    });

    // First check if profile exists using the auth user id
    const { data: existingProfile, error: checkError } = await supabase
      .from('profiles')
      .select('*')
      .eq('profiles_id', user.id)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {  // PGRST116 means no rows returned
      logger.error('Error checking existing profile:', checkError);
      throw checkError;
    }

    if (existingProfile) {
      logger.debug('Found existing profile:', existingProfile);
      return existingProfile;
    }

    // If no profile exists, create one
    const profileData = {
      profiles_id: user.id  // This should match your schema
    };

    logger.debug('Attempting to create profile with data:', profileData);

    // Create new profile with upsert to handle race conditions
    const { data: newProfile, error: insertError } = await supabase
      .from('profiles')
      .upsert([profileData], {
        onConflict: 'profiles_id',
        ignoreDuplicates: false
      })
      .select()
      .single();

    if (insertError) {
      logger.error('Database error creating profile:', {
        error: insertError,
        code: insertError.code,
        details: insertError.details,
        hint: insertError.hint,
        message: insertError.message,
        data: profileData
      });
      throw new Error(`Failed to create user profile: ${insertError.message}`);
    }

    if (!newProfile) {
      throw new Error('Profile creation succeeded but no profile was returned');
    }

    logger.debug('Successfully created new profile:', newProfile);
    return newProfile;

  } catch (error) {
    logger.error('Error in createUserProfileFromOAuth:', {
      error: error.message,
      stack: error.stack,
      userId: user?.id
    });
    throw error;
  }
}