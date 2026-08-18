const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../../middleware/auth');
const { login, logout, status } = require('../../controllers/admin/auth.controller');

const requireAdmin = requireRole('admin');

router.post('/login', login);
router.post('/logout', requireAuth, requireAdmin, logout);
router.post('/logout-beacon', async (req, res) => {
  // Accept token from the HttpOnly cookie, Authorization header, or body.
  // This endpoint does not require auth due to beacon usage.
  const authHeader = req.headers.authorization;
  const token =
    (req.cookies && (req.cookies.admin_token || req.cookies.token)) ||
    (authHeader && authHeader.split(' ')[1]) ||
    req.body?.token;
  if (!token) {
    return res.sendStatus(204);
  }

  try {
    const payload = require('../../services/auth.service').verifyAccessToken(token);
    if (!payload?.sub) return res.sendStatus(204);

    const User = require('../../models/user.model');
    const user = await User.findById(payload.sub);
    if (user) {
      user.status = 'inactive';
      user.refreshTokens = [];
      await user.save();
    }
  } catch (err) {
    // ignore errors
  }
  return res.sendStatus(204);
});

router.get('/status', requireAuth, requireAdmin, status);

module.exports = router;
