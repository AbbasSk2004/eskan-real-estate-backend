const express = require('express');
const router = express.Router();
const authService = require('../services/auth.service');
const User = require('../models/user.model');
const { requireAuth } = require('../middleware/auth');

// Helper to normalise token shapes for compatibility
const buildAuthResponse = (user, tokens) => {
  // tokens: { accessToken, refreshToken, expiresAt }
  const response = {
    success: true,
    user,
    session: {
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_at: tokens.expiresAt
    },
    // Compatibility layer for older clients
    token: tokens.accessToken,
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken
  };
  return response;
};

// Register new user
router.post('/register', async (req, res) => {
  try {
    const {
      email,
      password,
      firstName,
      lastName,
      firstname,
      lastname,
      phone
    } = req.body || {};

    const resolvedFirstName = firstName || firstname;
    const resolvedLastName = lastName || lastname;

    if (!email || !password || !resolvedFirstName || !resolvedLastName) {
      return res.status(400).json({ success: false, error: 'validation_error', message: 'Missing required fields' });
    }

    const { user, tokens, verificationRequired } = await authService.register({
      email,
      password,
      firstName: resolvedFirstName,
      lastName: resolvedLastName,
      phone
    });

    if (verificationRequired) {
      return res.status(201).json({ success: true, user, verificationRequired: true, message: 'Email verification required' });
    }

    return res.status(201).json(buildAuthResponse(user, tokens));
  } catch (err) {
    console.error('Register error', err);
    const statusCode = err.code === 'EMAIL_EXISTS' ? 409 : 500;
    return res.status(statusCode).json({ success: false, error: err.code || 'server_error', message: err.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'validation_error', message: 'Missing email or password' });
    }

    const { user, tokens } = await authService.login({ email, password });
    return res.json(buildAuthResponse(user, tokens));
  } catch (err) {
    console.error('Login error', err);
    const status = err.code === 'INVALID_CREDENTIALS' ? 401 : err.code === 'PASSWORD_NOT_SET' ? 400 : 500;
    return res.status(status).json({ success: false, error: err.code || 'server_error', message: err.message });
  }
});

// Refresh tokens
router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = req.body.refresh_token || req.body.refreshToken;
    const userId = req.body.userId || req.body.user_id || req.headers['x-user-id'];

    if (!refreshToken) {
      return res.status(400).json({ success: false, error: 'validation_error', message: 'Missing refresh token' });
    }

    if (!userId) {
      return res.status(400).json({ success: false, error: 'validation_error', message: 'Missing userId' });
    }

    const { user, tokens } = await authService.refresh({ userId, refreshToken });
    // Return tokens at top-level to satisfy existing client expectations
    return res.json({ success: true, user, access_token: tokens.accessToken, refresh_token: tokens.refreshToken });
  } catch (err) {
    console.error('Refresh token error', err);
    const status = err.code === 'INVALID_REFRESH_TOKEN' ? 401 : 500;
    return res.status(status).json({ success: false, error: err.code || 'server_error', message: err.message });
  }
});

// Verify access token and return current user
router.get('/verify', requireAuth, async (req, res) => {
  return res.json({ success: true, user: req.user });
});

// Update user status (e.g., active/inactive) - used by frontend for presence tracking
router.post('/update-status', async (req, res) => {
  try {
    // Token may come from Authorization header or body (sendBeacon)
    const authHeader = req.headers.authorization;
    let token = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.body?.token) {
      token = req.body.token;
    }

    if (!token) {
      return res.status(401).json({ success: false, error: 'unauthorized', message: 'Authorization token missing' });
    }

    const payload = authService.verifyAccessToken(token);
    if (!payload || !payload.sub) {
      return res.status(401).json({ success: false, error: 'unauthorized', message: 'Invalid access token' });
    }

    const user = await User.findById(payload.sub);
    if (!user) {
      return res.status(404).json({ success: false, error: 'user_not_found', message: 'User not found' });
    }

    const status = req.body.status || 'active';
    user.status = status;
    await user.save();

    return res.json({ success: true, status: user.status });
  } catch (err) {
    console.error('Update status error', err);
    return res.status(500).json({ success: false, error: 'server_error', message: err.message });
  }
});

// Logout (revoke refresh token)
router.post('/logout', async (req, res) => {
  try {
    const refreshToken = req.body.refresh_token || req.body.refreshToken;
    const userId = req.body.userId || req.body.user_id;

    if (!refreshToken || !userId) {
      return res.status(400).json({ success: false, error: 'validation_error', message: 'userId and refreshToken are required' });
    }

    await authService.revokeRefreshToken(userId, refreshToken);
    return res.json({ success: true, message: 'Logout successful' });
  } catch (err) {
    console.error('Logout error', err);
    return res.status(500).json({ success: false, error: 'server_error', message: err.message });
  }
});

// Verify OTP - activate user account
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, token } = req.body || {};
    if (!email || !token) {
      return res.status(400).json({ success: false, error: 'validation_error', message: 'Email and token are required' });
    }

    const { user, tokens } = await authService.verifyEmailOtp({ email, token });
    return res.json(buildAuthResponse(user, tokens));
  } catch (err) {
    console.error('Verify OTP error', err);
    const status = err.code === 'INVALID_OTP' || err.code === 'OTP_EXPIRED' ? 400 : 500;
    return res.status(status).json({ success: false, error: err.code || 'server_error', message: err.message });
  }
});

// Resend OTP
router.post('/resend-otp', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) {
      return res.status(400).json({ success: false, error: 'validation_error', message: 'Email is required' });
    }

    await authService.resendEmailVerification({ email });
    return res.json({ success: true, message: 'Verification code resent' });
  } catch (err) {
    console.error('Resend OTP error', err);
    const status = err.code === 'USER_NOT_FOUND' || err.code === 'ALREADY_VERIFIED' ? 400 : 500;
    return res.status(status).json({ success: false, error: err.code || 'server_error', message: err.message });
  }
});

module.exports = router;
