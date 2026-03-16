const authService = require('../services/auth.service');
const User = require('../models/user.model');

const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'unauthorized', message: 'Authorization header missing' });
    }

    const token = authHeader.split(' ')[1];
    const payload = authService.verifyAccessToken(token);
    if (!payload || !payload.sub) {
      return res.status(401).json({ error: 'unauthorized', message: 'Invalid access token' });
    }

    const user = await User.findById(payload.sub);
    if (!user) {
      return res.status(401).json({ error: 'unauthorized', message: 'User not found' });
    }

    req.user = user;
    req.tokenPayload = payload;
    next();
  } catch (err) {
    next(err);
  }
};

const requireRole = (roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'unauthorized', message: 'Authentication required' });
  }

  const normalizedRoles = Array.isArray(roles) ? roles : [roles];
  if (!normalizedRoles.includes(req.user.role)) {
    return res.status(403).json({ error: 'forbidden', message: 'Insufficient privileges' });
  }

  next();
};

const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];
  const payload = authService.verifyAccessToken(token);
  if (!payload || !payload.sub) {
    return next();
  }

  const user = await User.findById(payload.sub);
  if (!user) {
    return next();
  }

  req.user = user;
  req.tokenPayload = payload;
  next();
};

module.exports = {
  requireAuth,
  requireRole,
  optionalAuth
};
