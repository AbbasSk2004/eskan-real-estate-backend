const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');
const cron = require('node-cron');

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
        },
        // OTP verification will be handled by the email template
        // which should include {{ .Token }} instead of {{ .ConfirmationURL }}
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
      .upsert([
        {
          profiles_id: authData.user.id,
          firstname,
          lastname,
          phone,
          email
        }
      ], 
      { 
        onConflict: 'profiles_id',
        ignoreDuplicates: false
      })
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
      session: authData.session,
      message: 'Registration successful. Please check your email for the verification code. Note: You must verify your email within 1 hour or your account will be automatically deleted.'
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
        .upsert([{
          profiles_id: user.id,
          email: user.email,
          firstname: user.user_metadata?.full_name?.split(' ')[0] || '',
          lastname: user.user_metadata?.full_name?.split(' ').slice(1).join(' ') || '',
          profile_photo: user.user_metadata?.avatar_url,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }],
        {
          onConflict: 'profiles_id',
          ignoreDuplicates: false
        })
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
        .upsert([
          {
            profiles_id: user.id,
            email: user.email,
            firstname: user.profile.firstname,
            lastname: user.profile.lastname,
            profile_photo: user.profile.profile_photo,
            role: 'user',
            status: 'active'
          }
        ], {
          onConflict: 'profiles_id',
          ignoreDuplicates: false
        });

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
      
      // Check if error is due to user not found (might have been deleted after 1 hour)
      if (error.message.includes('user not found')) {
        return res.status(400).json({
          success: false,
          message: 'Verification failed. Your account may have been deleted because you did not verify within 1 hour. Please register again.'
        });
      }
      
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

// Verify OTP endpoint
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, token } = req.body;

    if (!email || !token) {
      return res.status(400).json({
        success: false,
        message: 'Email and verification code are required'
      });
    }

    // Verify OTP with Supabase
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email'
    });

    if (error) {
      logger.error('OTP verification error:', error);
      
      // Check if error is due to user not found (might have been deleted after 1 hour)
      if (error.message.includes('user not found')) {
        return res.status(400).json({
          success: false,
          message: 'Verification failed. Your account may have been deleted because you did not verify within 1 hour. Please register again.'
        });
      }
      
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to verify email code'
      });
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('profiles_id', data.user.id)
      .single();

    if (profileError) {
      logger.error('Profile fetch error after OTP verification:', profileError);
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
      user: data.user,
      session: data.session
    });
  } catch (err) {
    logger.error('OTP verification error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to verify email code'
    });
  }
});

// Forgot password endpoint
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Check if user exists
    const { data: user, error: userError } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', email)
      .single();

    if (userError && userError.code !== 'PGRST116') {
      logger.error('User lookup error:', userError);
      return res.status(500).json({
        success: false,
        message: 'Failed to process request'
      });
    }

    // Even if user doesn't exist, don't reveal this for security reasons
    // Just proceed as if everything is fine
    
    // Request password reset from Supabase
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      type: 'recovery'
    });

    if (error) {
      logger.error('Password reset request error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to send password reset email'
      });
    }

    res.json({
      success: true,
      message: 'Password reset instructions sent to your email'
    });
  } catch (err) {
    logger.error('Forgot password error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to process password reset request'
    });
  }
});

// Reset password endpoint
router.post('/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Email, verification code, and new password are required'
      });
    }

    // Verify OTP first
    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: 'recovery'
    });

    if (verifyError) {
      logger.error('OTP verification error during password reset:', verifyError);
      return res.status(400).json({
        success: false,
        message: verifyError.message || 'Invalid or expired verification code'
      });
    }

    // If OTP is valid, update the password
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword
    });

    if (updateError) {
      logger.error('Password update error:', updateError);
      return res.status(400).json({
        success: false,
        message: updateError.message || 'Failed to update password'
      });
    }

    res.json({
      success: true,
      message: 'Password has been reset successfully'
    });
  } catch (err) {
    logger.error('Password reset error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to reset password'
    });
  }
});

// Admin endpoint to manually trigger cleanup of unverified users
router.post('/admin/cleanup-unverified', async (req, res) => {
  try {
    // Check if request is from an admin
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }

    // Check if user is an admin
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('profiles_id', user.id)
      .single();

    if (profileError || profile?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    // Call the database function to delete unverified users
    const { data, error } = await supabase.rpc('delete_unverified_users');
    
    if (error) {
      logger.error('Error deleting unverified users:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete unverified users'
      });
    }
    
    const deletedCount = data;
    return res.json({
      success: true,
      message: `Successfully deleted ${deletedCount} unverified users`,
      deletedCount
    });
  } catch (err) {
    logger.error('Failed to run unverified users cleanup job:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to run cleanup job'
    });
  }
});

// Schedule job to delete unverified users after 1 hour
cron.schedule('0 * * * *', async () => {
  try {
    logger.info('Running scheduled job: delete unverified users');
    
    // Call the database function to delete unverified users
    const { data, error } = await supabase.rpc('delete_unverified_users');
    
    if (error) {
      logger.error('Error deleting unverified users:', error);
      return;
    }
    
    const deletedCount = data;
    if (deletedCount > 0) {
      logger.info(`Successfully deleted ${deletedCount} unverified users`);
    } else {
      logger.info('No unverified users to delete');
    }
  } catch (err) {
    logger.error('Failed to run unverified users cleanup job:', err);
  }
});

module.exports = router; 