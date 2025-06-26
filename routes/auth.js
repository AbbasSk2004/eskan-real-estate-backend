const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Login endpoint
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Sign in with Supabase
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      logger.error('Login error:', error);
      return res.status(401).json({
        success: false,
        message: error.message
      });
    }

    // Get user profile data
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('profiles_id', data.user.id)
      .single();

    if (profileError) {
      logger.error('Profile fetch error:', profileError);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch user profile'
      });
    }

    // Update user status to active
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ 
        status: 'active',
        last_login: new Date().toISOString()
      })
      .eq('profiles_id', data.user.id);

    if (updateError) {
      logger.error('Status update error:', updateError);
      // Continue with login even if status update fails
    }

    res.json({
      success: true,
      user: {
        ...data.user,
        profile: {
          ...profile,
          status: 'active' // Return the updated status
        }
      },
      session: data.session
    });
  } catch (err) {
    logger.error('Login error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to login'
    });
  }
});

// Register endpoint
router.post('/register', async (req, res) => {
  try {
    const { email, password, firstname, lastname, phone } = req.body;

    // Validate required fields
    if (!email || !password || !firstname || !lastname || !phone) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          firstname,
          lastname,
          phone
        }
      }
    });

    if (authError) {
      logger.error('Registration error:', authError);
      return res.status(400).json({
        success: false,
        message: authError.message
      });
    }

    // Create profile in profiles table
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .insert([
        {
          profiles_id: authData.user.id,
          firstname,
          lastname,
          phone,
          email
        }
      ])
      .select()
      .single();

    if (profileError) {
      logger.error('Profile creation error:', profileError);
      // Attempt to clean up the auth user if profile creation fails
      await supabase.auth.admin.deleteUser(authData.user.id);
      return res.status(500).json({
        success: false,
        message: 'Failed to create user profile'
      });
    }

    res.status(201).json({
      success: true,
      user: {
        ...authData.user,
        profile
      },
      session: authData.session
    });
  } catch (err) {
    logger.error('Registration error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to register user'
    });
  }
});

// Logout endpoint
router.post('/logout', async (req, res) => {
  try {
    // Get user ID from the authorization header
    const authHeader = req.headers.authorization;
    let userId = null;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const { data: userData, error: userError } = await supabase.auth.getUser(token);
      
      if (!userError && userData?.user) {
        userId = userData.user.id;
        
        // Update user status to inactive
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ status: 'inactive' })
          .eq('profiles_id', userId);
          
        if (updateError) {
          logger.error('Status update error on logout:', updateError);
          // Continue with logout even if status update fails
        }
      }
    }
    
    const { error } = await supabase.auth.signOut();
    
    if (error) {
      logger.error('Logout error:', error);
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }

    res.json({
      success: true,
      message: 'Successfully logged out'
    });
  } catch (err) {
    logger.error('Logout error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to logout'
    });
  }
});

// Refresh token endpoint
router.post('/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token is required'
      });
    }

    // Exchange refresh token for new access token using Supabase
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token
    });

    if (error) {
      logger.error('Token refresh error:', error);
      return res.status(401).json({
        success: false,
        message: error.message || 'Failed to refresh token'
      });
    }

    if (!data?.session) {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token'
      });
    }

    // Get user profile data
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('profiles_id', data.user.id)
      .single();

    if (profileError) {
      logger.error('Profile fetch error:', profileError);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch user profile'
      });
    }

    // Return new tokens and user profile
    res.json({
      success: true,
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      user: {
        ...data.user,
        profile
      }
    });
  } catch (err) {
    logger.error('Token refresh error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to refresh token'
    });
  }
});

// Verify token endpoint
router.get('/verify', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }

    // Get user profile data
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('profiles_id', user.id)
      .single();

    if (profileError) {
      logger.error('Profile fetch error:', profileError);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch user profile'
      });
    }

    // Get current session
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError) {
      logger.error('Session fetch error:', sessionError);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch session'
      });
    }

    res.json({
      success: true,
      user: {
        ...user,
        profile
      },
      session: sessionData.session
    });
  } catch (err) {
    logger.error('Token verification error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to verify token'
    });
  }
});

// Update user status endpoint
router.post('/update-status', async (req, res) => {
  try {
    // Handle both FormData and JSON requests
    let token, status;
    
    // Check if request is from FormData (from sendBeacon)
    if (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data')) {
      token = req.body.token;
      status = req.body.status;
    } else {
      // Regular JSON request
      ({ token, status } = req.body);
    }
    
    if (!token) {
      // Also check Authorization header as fallback
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      } else {
        return res.status(400).json({
          success: false,
          message: 'Token is required'
        });
      }
    }

    // Get user from token
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      logger.error('Invalid token in status update:', userError);
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }

    // Update user status
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ status: status || 'inactive' })
      .eq('profiles_id', user.id);

    if (updateError) {
      logger.error('Status update error:', updateError);
      return res.status(500).json({
        success: false,
        message: 'Failed to update status'
      });
    }

    res.json({
      success: true,
      message: 'Status updated successfully'
    });
  } catch (err) {
    logger.error('Status update error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to update status'
    });
  }
});

// Google OAuth callback endpoint
router.post('/google/callback', async (req, res) => {
  try {
    const { access_token, refresh_token, provider_token } = req.body;

    if (!access_token) {
      return res.status(400).json({
        success: false,
        message: 'Access token is required'
      });
    }

    // Get user data from Supabase using the token
    const { data: { user }, error: userError } = await supabase.auth.getUser(access_token);

    if (userError) {
      logger.error('Error getting user from Supabase:', userError);
      return res.status(401).json({
        success: false,
        message: 'Invalid access token'
      });
    }

    // Get or create user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('profiles_id', user.id)
      .single();

    if (profileError && profileError.code !== 'PGRST116') {
      logger.error('Error getting profile:', profileError);
      return res.status(500).json({
        success: false,
        message: 'Failed to get user profile'
      });
    }

    let userProfile = profile;

    // If profile doesn't exist, create one
    if (!userProfile) {
      const { data: newProfile, error: createError } = await supabase
        .from('profiles')
        .insert([{
          profiles_id: user.id,
          email: user.email,
          firstname: user.user_metadata?.full_name?.split(' ')[0] || '',
          lastname: user.user_metadata?.full_name?.split(' ').slice(1).join(' ') || '',
          profile_photo: user.user_metadata?.avatar_url,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (createError) {
        logger.error('Error creating profile:', createError);
        return res.status(500).json({
          success: false,
          message: 'Failed to create user profile'
        });
      }

      userProfile = newProfile;
    }

    // Create a new session
    const session = {
      access_token,
      refresh_token,
      provider_token,
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString() // 1 hour from now
    };

    res.json({
      success: true,
      user: {
        ...user,
        profile: userProfile
      },
      session
    });
  } catch (err) {
    logger.error('Google callback error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to process Google authentication'
    });
  }
});

// Verify Supabase token endpoint
router.post('/verify-token', async (req, res) => {
  try {
    const { token, user } = req.body;
    
    if (!token || !user) {
      return res.status(400).json({
        success: false,
        message: 'Token and user data are required'
      });
    }

    // Verify the token with Supabase
    const { data, error } = await supabase.auth.getUser(token);
    
    if (error) {
      logger.error('Token verification error:', error);
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }

    // Check if user exists in your database
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError && profileError.code !== 'PGRST116') { // PGRST116 is "not found" error
      logger.error('Profile fetch error:', profileError);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch user profile'
      });
    }

    // If profile doesn't exist, create it
    if (!profile) {
      const { error: insertError } = await supabase
        .from('profiles')
        .insert([
          {
            id: user.id,
            email: user.email,
            first_name: user.profile.firstname,
            last_name: user.profile.lastname,
            avatar_url: user.profile.profile_photo,
            provider: user.provider
          }
        ]);

      if (insertError) {
        logger.error('Profile creation error:', insertError);
        return res.status(500).json({
          success: false,
          message: 'Failed to create user profile'
        });
      }
    }

    res.json({
      success: true,
      message: 'Token verified successfully',
      user: data.user
    });
  } catch (err) {
    logger.error('Token verification error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to verify token'
    });
  }
});

// Health check endpoint
router.get('/check', async (req, res) => {
  try {
    // Get the authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.json({
        success: true,
        authenticated: false,
        message: 'No authentication token provided'
      });
    }

    // Extract the token
    const token = authHeader.replace('Bearer ', '');
    
    // Verify the token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error) {
      return res.json({
        success: true,
        authenticated: false,
        message: 'Invalid or expired token'
      });
    }

    // Check if user exists in your database
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    return res.json({
      success: true,
      authenticated: true,
      user: {
        ...user,
        profile
      }
    });
  } catch (err) {
    logger.error('Health check error:', err);
    return res.json({
      success: false,
      authenticated: false,
      message: 'Server error during health check'
    });
  }
});

// Verify email with Supabase token directly
router.post('/verify-supabase', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Verification token is required'
      });
    }

    // Use Supabase admin API to verify the token
    const { data, error } = await supabase.auth.admin.verifyEmail(token);

    if (error) {
      logger.error('Email verification error:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to verify email'
      });
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('profiles_id', data.user.id)
      .single();

    if (profileError) {
      logger.error('Profile fetch error after verification:', profileError);
      // Continue with verification success even if profile fetch fails
    } else if (profile) {
      // Update profile to mark as verified
      await supabase
        .from('profiles')
        .update({ email_verified: true })
        .eq('profiles_id', data.user.id);
    }

    return res.json({
      success: true,
      message: 'Email verified successfully',
      user: data.user
    });
  } catch (err) {
    logger.error('Supabase verification error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to verify email'
    });
  }
});

module.exports = router; 