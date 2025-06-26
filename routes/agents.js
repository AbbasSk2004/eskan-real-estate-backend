const express = require('express');
const router = express.Router();
const multer = require('multer');
const { supabase } = require('../config/supabaseClient');
const logger = require('../utils/logger');
const { uploadToSupabaseStorage } = require('../utils/storage');

// Define storage bucket names and paths
const PROPERTY_IMAGES_BUCKET = 'property-images';
const RESUME_PATH = 'agents/cv_resumes';
const PROFILE_PHOTO_PATH = 'agents/profile_photos';

// Configure multer for file uploads with size limits and file filters
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'profilePhoto') {
      if (!file.mimetype.startsWith('image/')) {
        return cb(new Error('Profile photo must be an image file'));
      }
    } else if (file.fieldname === 'cvResume') {
      const allowedTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
        'application/vnd.ms-powerpoint', // .ppt
        'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
        'text/plain' // .txt
      ];
      if (!allowedTypes.includes(file.mimetype)) {
        return cb(new Error('Resume must be a PDF, Word, PowerPoint, or TXT document'));
      }
    }
    cb(null, true);
  }
});

// Helper function to verify session
const verifySession = async (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: 'No token provided' };
  }

  const token = authHeader.split(' ')[1];
  
  try {
    // First try to verify with Supabase (for Google login)
    const { data: { user: supabaseUser }, error: supabaseError } = await supabase.auth.getUser(token);
    
    if (supabaseUser && !supabaseError) {
      // Get the user's profile from the profiles table
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('profiles_id', supabaseUser.id)
        .single();

      if (profileError) {
        console.error('Profile fetch error:', profileError);
        return { error: 'Failed to fetch user profile' };
      }

      return { user: { ...supabaseUser, profile } };
    }

    // If Supabase verification fails, try regular token verification
    const { data: regularUser, error: regularError } = await supabase
      .from('profiles')
      .select('*')
      .eq('auth_token', token)
      .single();

    if (regularError || !regularUser) {
      return { error: 'Invalid token' };
    }

    return { user: regularUser };
  } catch (error) {
    console.error('Session verification error:', error);
    return { error: 'Invalid token' };
  }
};

// Get all agents
router.get('/', async (req, res) => {
  try {
    console.log('Fetching all agents...');
    const { data, error } = await supabase
      .from('agents')
      .select(`
        *,
        profiles:profiles_id (
          firstname,
          lastname,
          email,
          profile_photo,
          phone
        )
      `)
      .eq('approved', true)
      .eq('status', 'approved')
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Error fetching agents:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch agents',
        error: error.message
      });
    }

    console.log('Fetched agents:', data);

    // Transform data to match frontend expectations
    const transformedAgents = (data || []).map(agent => ({
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
      status: agent.status,
      approved: agent.approved,
      cv_resume_url: agent.cv_resume_url,
      approved_at: agent.approved_at,
      created_at: agent.created_at,
      updated_at: agent.updated_at,
      profiles: {
        firstname: agent.profiles?.firstname,
        lastname: agent.profiles?.lastname,
        email: agent.profiles?.email,
        profile_photo: agent.profiles?.profile_photo,
        phone: agent.profiles?.phone
      }
    }));

    console.log('Transformed agents:', transformedAgents);

    res.json({
      success: true,
      message: 'Agents fetched successfully',
      data: transformedAgents
    });
  } catch (err) {
    logger.error('Error fetching agents:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch agents',
      error: err.message
    });
  }
});

// Get featured agents
router.get('/featured', async (req, res) => {
  try {
    console.log('Fetching featured agents...');
    const { data, error } = await supabase
      .from('agents')
      .select(`
        *,
        profiles:profiles_id (
          firstname,
          lastname,
          email,
          profile_photo,
          phone
        )
      `)
      .eq('status', 'approved')
      .eq('approved', true)
      .eq('is_featured', true)
      .order('created_at', { ascending: false })
      .limit(6);

    if (error) {
      logger.error('Error fetching featured agents:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch featured agents',
        error: error.message
      });
    }

    console.log('Fetched featured agents:', data);

    // Transform data to match frontend expectations
    const transformedAgents = (data || []).map(agent => ({
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
      status: agent.status,
      approved: agent.approved,
      cv_resume_url: agent.cv_resume_url,
      approved_at: agent.approved_at,
      created_at: agent.created_at,
      updated_at: agent.updated_at,
      profiles: {
        firstname: agent.profiles?.firstname,
        lastname: agent.profiles?.lastname,
        email: agent.profiles?.email,
        profile_photo: agent.profiles?.profile_photo,
        phone: agent.profiles?.phone
      }
    }));

    console.log('Transformed featured agents:', transformedAgents);

    res.json({
      success: true,
      message: 'Featured agents fetched successfully',
      data: transformedAgents
    });

  } catch (err) {
    logger.error('Error fetching featured agents:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch featured agents',
      error: err.message
    });
  }
});

// Get agent by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('agents')
      .select(`
        *,
        profiles:profiles_id (
          firstname,
          lastname,
          email,
          phone,
          profile_photo
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found'
      });
    }

    res.json({
      success: true,
      data
    });
  } catch (err) {
    logger.error('Error fetching agent:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch agent details'
    });
  }
});

// Get agent application details
router.get('/applications/details', async (req, res) => {
  try {
    // Verify session
    const { user, error: authError } = await verifySession(req);
    if (authError) {
      return res.status(401).json({
        success: false,
        message: 'Please log in to view application details'
      });
    }

    // First check if user exists in profiles
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('profiles_id', user.id)
      .single();

    if (profileError && profileError.code !== 'PGRST116') {
      logger.error('Profile fetch error:', profileError);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch user profile'
      });
    }

    // Then get agent application if it exists
    const { data: agentData, error: agentError } = await supabase
      .from('agents')
      .select(`
        id,
        specialty,
        experience,
        about_me,
        cv_resume_url,
        facebook_url,
        twitter_url,
        instagram_url,
        phone,
        status,
        approved,
        approved_at,
        created_at,
        image,
        is_featured,
        profiles!inner (
          firstname,
          lastname,
          email,
          profile_photo
        )
      `)
      .eq('profiles_id', user.id)
      .maybeSingle(); // Use maybeSingle instead of single to handle no rows gracefully

    if (agentError && agentError.code !== 'PGRST116') {
      logger.error('Error fetching agent application:', agentError);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch agent application'
      });
    }

    // Return the data, even if no application exists
    res.json({
      success: true,
      data: agentData || null
    });
  } catch (err) {
    logger.error('Error fetching agent application details:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch agent application details'
    });
  }
});

// Submit agent application
router.post('/applications', upload.fields([
  { name: 'profilePhoto', maxCount: 1 },
  { name: 'cvResume', maxCount: 1 }
]), async (req, res) => {
  try {
    // Verify session
    const { user, error: authError } = await verifySession(req);
    if (authError) {
      return res.status(401).json({
        success: false,
        message: 'Please log in to submit an application'
      });
    }

    // Log received data
    logger.info('Received form data:', {
      body: req.body,
      files: req.files ? Object.keys(req.files) : []
    });

    const {
      specialization,
      experience,
      bio,
      phone,
      languages,
      facebook_url,
      twitter_url,
      instagram_url
    } = req.body;

    // Check for required files
    if (!req.files?.cvResume?.[0]) {
      return res.status(400).json({
        success: false,
        message: 'Resume file is required'
      });
    }

    if (!req.files?.profilePhoto?.[0]) {
      return res.status(400).json({
        success: false,
        message: 'Profile photo is required'
      });
    }

    // Create an object to track missing fields
    const missingFields = [];
    if (!specialization) missingFields.push('specialization');
    if (!experience) missingFields.push('experience');
    if (!bio) missingFields.push('bio');
    if (!phone) missingFields.push('phone');
    if (!languages) missingFields.push('languages');

    // If any required fields are missing, return detailed error
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    // Handle file uploads
    let resumeUrl = null;
    let profilePhotoUrl = null;

    try {
      // Upload resume
      const resumeFile = req.files.cvResume[0];
      const timestamp = Date.now();
      const resumeFileName = `${RESUME_PATH}/${timestamp}_${resumeFile.originalname.replace(/[^a-zA-Z0-9.-]/g, '')}`;
      
      try {
        resumeUrl = await uploadToSupabaseStorage(
          {
            buffer: resumeFile.buffer,
            mimetype: resumeFile.mimetype
          },
          PROPERTY_IMAGES_BUCKET,
          resumeFileName
        );
        // The function now returns just the URL string, not an object
        console.log('Resume uploaded successfully:', resumeUrl);
      } catch (error) {
        logger.error('Resume upload error:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to upload resume',
          error: error.message
        });
      }

      // Upload profile photo
      const photoFile = req.files.profilePhoto[0];
      const photoFileName = `${PROFILE_PHOTO_PATH}/${timestamp}_${photoFile.originalname.replace(/[^a-zA-Z0-9.-]/g, '')}`;
      
      try {
        profilePhotoUrl = await uploadToSupabaseStorage(
          {
            buffer: photoFile.buffer,
            mimetype: photoFile.mimetype
          },
          PROPERTY_IMAGES_BUCKET,
          photoFileName
        );
        // The function now returns just the URL string, not an object
        console.log('Profile photo uploaded successfully:', profilePhotoUrl);
      } catch (error) {
        logger.error('Profile photo upload error:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to upload profile photo',
          error: error.message
        });
      }

      // Log the data we're about to insert
      console.log('Attempting to insert agent with data:', {
        profiles_id: user.id,
        specialty: specialization,
        experience,
        about_me: bio,
        cv_resume_url: resumeUrl,
        image: profilePhotoUrl,
        phone,
        facebook_url,
        twitter_url,
        instagram_url,
        status: 'pending',
        approved: false
      });

      // Create agent application
      const { data, error } = await supabase
        .from('agents')
        .insert([{
          profiles_id: user.id,
          specialty: specialization,
          experience,
          about_me: bio,
          cv_resume_url: resumeUrl,
          image: profilePhotoUrl,
          phone,
          facebook_url: facebook_url || null,
          twitter_url: twitter_url || null,
          instagram_url: instagram_url || null,
          status: 'pending',
          approved: false
        }])
        .select()
        .single();

      if (error) {
        logger.error('Error creating agent application:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to create agent application',
          error: error.message
        });
      }

      console.log('Agent application created successfully:', data);

      res.status(201).json({
        success: true,
        message: 'Application submitted successfully',
        data
      });
    } catch (err) {
      logger.error('Error in file upload process:', err);
      res.status(500).json({
        success: false,
        message: err.message || 'Failed to process file uploads'
      });
    }
  } catch (err) {
    logger.error('Error submitting agent application:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Failed to submit application'
    });
  }
});

module.exports = router; 