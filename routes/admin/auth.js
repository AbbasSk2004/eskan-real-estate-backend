const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../../middleware/auth');
const { login, logout, status } = require('../../controllers/admin/auth.controller');

const requireAdmin = requireRole('admin');

router.post('/login', login);
router.post('/logout', requireAuth, requireAdmin, logout);
router.post('/logout-beacon', async (req, res) => {
  // Mirror old behavior: accept token and set status to inactive
  // This endpoint does not require auth due to beacon usage.
  const token = req.body?.token || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
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
