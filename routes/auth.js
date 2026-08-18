const express = require('express');
const router = express.Router();
const authService = require('../services/auth.service');
const User = require('../models/user.model');
const { requireAuth } = require('../middleware/auth');
const { setAuthCookies, clearAuthCookies, REFRESH_TOKEN_COOKIE, ADMIN_REFRESH_TOKEN_COOKIE } = require('../config/cookies');

// Helper to normalise token shapes for compatibility
const buildAuthResponse = (user) => {
  // Tokens are never included in the JSON payload — they live exclusively
  // in HttpOnly cookies (see config/cookies.js).
  const response = {
    success: true,
    user
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

    const { user, tokens, verificationRequired, devOtp } = await authService.register({
      email,
      password,
      firstName: resolvedFirstName,
      lastName: resolvedLastName,
      phone
    });

    if (verificationRequired) {
      return res.status(201).json({ success: true, user, verificationRequired: true, devOtp, message: 'Email verification required' });
    }

    clearAuthCookies(res, 'admin');
    setAuthCookies(res, tokens);
    return res.status(201).json(buildAuthResponse(user));
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
    clearAuthCookies(res, 'admin');
    setAuthCookies(res, tokens);
    return res.json(buildAuthResponse(user));
  } catch (err) {
    console.error('Login error', err);
    const statusByCode = {
      INVALID_CREDENTIALS: 401,
      EMAIL_NOT_VERIFIED: 403,
      PASSWORD_NOT_SET: 400
    };
    const status = statusByCode[err.code] || 500;
    return res.status(status).json({ success: false, error: err.code || 'server_error', message: err.message });
  }
});

// Request a password reset code
router.post('/forgot-password', async (req, res) => {
  try {
    const result = await authService.requestPasswordReset({ email: req.body?.email });
    return res.json({ success: true, message: result.message || 'If an account exists with that email, a reset code has been sent.', devOtp: result.devOtp });
  } catch (err) {
    const status = err.code === 'VALIDATION_ERROR' ? 400 : 500;
    return res.status(status).json({ success: false, error: err.code || 'server_error', message: err.message });
  }
});

// Reset the password with the emailed code
router.post('/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body || {};
    await authService.resetPassword({ email, otp, newPassword });
    return res.json({ success: true, message: 'Password has been reset successfully' });
  } catch (err) {
    const statusByCode = { VALIDATION_ERROR: 400, WEAK_PASSWORD: 400, INVALID_OTP: 400, OTP_EXPIRED: 400 };
    const status = statusByCode[err.code] || 500;
    return res.status(status).json({ success: false, error: err.code || 'server_error', message: err.message });
  }
});

// Refresh tokens
router.post('/refresh', async (req, res) => {
  try {
    // Cookie-first: the refresh token travels in an HttpOnly cookie. Legacy
    // body/header values are still accepted for older clients.
    const refreshToken =
      req.cookies?.[REFRESH_TOKEN_COOKIE] ||
      req.cookies?.[ADMIN_REFRESH_TOKEN_COOKIE] ||
      req.body.refresh_token ||
      req.body.refreshToken;

    if (!refreshToken) {
      return res.status(400).json({ success: false, error: 'validation_error', message: 'Missing refresh token' });
    }

    // The refresh JWT carries the user id, so no other identifier is required.
    const payload = authService.verifyRefreshTokenJwt(refreshToken);
    const userId = payload?.sub || req.body.userId || req.body.user_id || req.headers['x-user-id'];

    if (!userId) {
      return res.status(400).json({ success: false, error: 'validation_error', message: 'Missing userId' });
    }

    const { user, tokens } = await authService.refresh({ userId, refreshToken });
    clearAuthCookies(res, 'admin');
    setAuthCookies(res, tokens);
    return res.json({ success: true, user });
  } catch (err) {
    console.error('Refresh token error', err);
    const status = err.code === 'INVALID_REFRESH_TOKEN' ? 401 : 500;
    return res.status(status).json({ success: false, error: err.code || 'server_error', message: err.message });
  }
});

// Verify access token and return current user
router.get('/verify', requireAuth, async (req, res) => {
  return res.json({ success: true, user: authService.sanitizeUser(req.user) });
});

// Update user status (e.g., active/inactive) - used by frontend for presence tracking
router.post('/update-status', async (req, res) => {
  try {
    // Token may come from the HttpOnly cookie, Authorization header, or body (sendBeacon).
    // Public-first precedence, but accept whichever candidate verifies (stale
    // cookies from a rotated secret must not shadow a valid session).
    const authHeader = req.headers.authorization;
    const candidates = authHeader && authHeader.startsWith('Bearer ')
      ? [authHeader.split(' ')[1]]
      : [req.cookies?.token, req.cookies?.admin_token, req.body?.token].filter(Boolean);

    let payload = null;
    for (const candidate of candidates) {
      const p = authService.verifyAccessToken(candidate);
      if (p?.sub) { payload = p; break; }
    }

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

// Logout (revoke refresh token + clear HttpOnly cookies)
router.post('/logout', async (req, res) => {
  try {
    const refreshToken =
      req.cookies?.[REFRESH_TOKEN_COOKIE] ||
      req.cookies?.[ADMIN_REFRESH_TOKEN_COOKIE] ||
      req.body.refresh_token ||
      req.body.refreshToken;
    const userId =
      req.cookies?.token || req.cookies?.admin_token
        ? (() => {
            const token = req.cookies.token || req.cookies.admin_token;
            const payload = authService.verifyAccessToken(token);
            return payload?.sub || null;
          })()
        : req.body.userId || req.body.user_id;

    if (refreshToken && userId) {
      await authService.revokeRefreshToken(userId, refreshToken);
    }

    clearAuthCookies(res, 'user');
    clearAuthCookies(res, 'admin');
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
    clearAuthCookies(res, 'admin');
    setAuthCookies(res, tokens);
    return res.json(buildAuthResponse(user));
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

    const { success, devOtp } = await authService.resendEmailVerification({ email });
    return res.json({ success, message: 'Verification code resent', devOtp });
  } catch (err) {
    console.error('Resend OTP error', err);
    const status = err.code === 'USER_NOT_FOUND' || err.code === 'ALREADY_VERIFIED' ? 400 : 500;
    return res.status(status).json({ success: false, error: err.code || 'server_error', message: err.message });
  }
});

module.exports = router;
