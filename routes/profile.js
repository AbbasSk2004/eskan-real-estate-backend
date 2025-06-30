const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');
const { uploadToSupabaseStorage, deleteFromSupabaseStorage } = require('../utils/storage');
const logger = require('../utils/logger');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  }
});

// Helper function to extract file path from Supabase URL
const extractFilePathFromUrl = (url) => {
  if (!url) return null;
  // Skip if it's an external URL (e.g., from Google)
  if (url.startsWith('http') && !url.includes('supabase')) return null;
  
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/');
    // Remove 'object/public' from path
    const relevantParts = pathParts.slice(pathParts.indexOf('public') + 1);
    return relevantParts.join('/');
  } catch (err) {
    logger.error('Error extracting file path:', err);
    return null;
  }
};

// Enhanced session check with user metadata
const checkSession = async (req) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return { error: 'No token provided' };
    }

    // Get user from auth
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError) {
      return { error: userError.message };
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
        const { data: { user: googleUser }, error: googleError } = await supabase.auth.getUser(token);
        const userData = googleUser?.user_metadata || {};
        
        // Create new profile with correct data structure
        const newProfile = {
          profiles_id: user.id,
          email: user.email,
          firstname: userData.full_name?.split(' ')[0] || '',
          lastname: userData.full_name?.split(' ').slice(1).join(' ') || '',
          profile_photo: userData.avatar_url || userData.picture || '',
          role: 'user',
          status: 'inactive'
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

        return { profile: createdProfile };
      }
      
      logger.error('Profile fetch error:', profileError);
      return { error: profileError.message };
    }

    return { profile };
  } catch (err) {
    logger.error('Session check error:', err);
    return { error: 'Session check failed' };
  }
};

// Update profile
router.put('/', upload.single('profile_photo'), async (req, res) => {
  try {
    // Check session with enhanced profile check
    const { profile, error: sessionError } = await checkSession(req);
    if (sessionError) {
      return res.status(401).json({
        success: false,
        message: sessionError
      });
    }

    const { firstname, lastname, phone, bio } = req.body;

    // Prepare update data - use nullish coalescing to allow empty strings
    const updateData = {
      firstname: firstname ?? profile.firstname,
      lastname: lastname ?? profile.lastname,
      phone: phone ?? profile.phone,
      bio: bio ?? profile.bio,
      updated_at: new Date().toISOString()
    };

    // Handle profile photo upload if provided
    if (req.file) {
      try {
        // First, try to delete the old profile photo if it exists and is in Supabase
        const oldPhotoPath = extractFilePathFromUrl(profile.profile_photo);
        if (oldPhotoPath) {
          try {
            await deleteFromSupabaseStorage('property-images', oldPhotoPath);
            logger.info('Successfully deleted old profile photo:', oldPhotoPath);
          } catch (deleteError) {
            logger.error('Error deleting old profile photo:', deleteError);
            // Continue with upload even if delete fails
          }
        }

        // Upload new profile photo
        const file = req.file;
        const path = `profiles/${profile.profiles_id}/${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`;
        const imageUrl = await uploadToSupabaseStorage(file, 'property-images', path);
        
        // Store the URL string directly
        updateData.profile_photo = imageUrl;
      } catch (uploadError) {
        logger.error('Profile photo upload error:', uploadError);
        return res.status(400).json({
          success: false,
          message: 'Failed to upload profile photo'
        });
      }
    }

    // Update profile in database
    const { data, error } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('profiles_id', profile.profiles_id)
      .select()
      .single();

    if (error) {
      logger.error('Profile update error:', error);
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: data
    });

  } catch (err) {
    logger.error('Profile update error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
});

// Get profile
router.get('/', async (req, res) => {
  try {
    // Check session with enhanced profile check
    const { profile, error: sessionError } = await checkSession(req);
    if (sessionError) {
      return res.status(401).json({
        success: false,
        message: sessionError
      });
    }

    res.json({
      success: true,
      data: profile
    });

  } catch (err) {
    logger.error('Profile fetch error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile'
    });
  }
});

// Change password
router.post('/change-password', async (req, res) => {
  try {
    // Check session with enhanced profile check
    const { profile, error: sessionError } = await checkSession(req);
    if (sessionError) {
      return res.status(401).json({
        success: false,
        message: sessionError
      });
    }

    const { currentPassword, newPassword } = req.body;

    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters long'
      });
    }

    // Get the token from request headers
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication token is required'
      });
    }

    // First verify the current password
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: profile.email,
      password: currentPassword
    });

    if (signInError) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update the password
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      profile.profiles_id,
      { password: newPassword }
    );

    if (updateError) {
      logger.error('Password update error:', updateError);
      return res.status(400).json({
        success: false,
        message: updateError.message
      });
    }

    // Immediately mark user status as inactive – the current session will be invalidated,
    // so front-end logout may fail to update status. Doing it here guarantees consistency.
    try {
      await supabase
        .from('profiles')
        .update({ status: 'inactive' })
        .eq('profiles_id', profile.profiles_id);
    } catch (statusErr) {
      // Log but don't block password change success.
      logger.warn('Failed to set status inactive after password change:', statusErr);
    }

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (err) {
    logger.error('Password change error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to change password'
    });
  }
});

module.exports = router; 