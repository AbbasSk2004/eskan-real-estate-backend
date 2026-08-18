const authService = require('../services/auth.service');
const User = require('../models/user.model');
const { v4: uuidv4 } = require('uuid');
const { VISITOR_COOKIE, setVisitorCookie } = require('../config/cookies');

// Resolve candidate access tokens: Authorization header (legacy clients),
// then HttpOnly cookies. Cookie precedence is scope-aware — admin routes
// prefer the admin cookie so a stale public-site cookie can never shadow a
// fresh admin session on the same host (localhost shares cookies across ports).
const getTokenCandidates = (req) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return [authHeader.split(' ')[1]];
  }

  const isAdminRoute =
    (req.originalUrl || '').startsWith('/api/admin') ||
    (req.baseUrl || '').startsWith('/admin');

  if (isAdminRoute) {
    return [req.cookies?.admin_token, req.cookies?.token].filter(Boolean);
  }
  return [req.cookies?.token, req.cookies?.admin_token].filter(Boolean);
};

// Accept the first candidate that verifies (covers stale cookies issued under
// a rotated secret, so a valid session cookie always wins).
const resolveAuthPayload = async (req) => {
  const candidates = getTokenCandidates(req);
  if (candidates.length === 0) return null;

  let lastPayload = null;
  for (const token of candidates) {
    const payload = authService.verifyAccessToken(token);
    if (payload?.sub) return { token, payload };
    lastPayload = payload;
  }
  return lastPayload ? { token: null, payload: null } : null;
};

const requireAuth = async (req, res, next) => {
  try {
    const resolved = await resolveAuthPayload(req);
    if (!resolved || !resolved.payload?.sub) {
      return res.status(401).json({ error: 'unauthorized', message: 'Invalid access token' });
    }

    const { payload } = resolved;
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
  // "Optional" means failure to resolve an identity must never fail the
  // request — the caller continues as a guest. Without this guard a rejected
  // User lookup would surface as an unhandled rejection (Express 4 does not
  // catch async middleware errors) and the request would hang with no reply.
  try {
    const resolved = await resolveAuthPayload(req);
    if (!resolved?.payload?.sub) {
      return next();
    }

    const user = await User.findById(resolved.payload.sub);
    if (!user) {
      return next();
    }

    req.user = user;
    req.tokenPayload = resolved.payload;
  } catch (err) {
    console.warn('optionalAuth: continuing as guest', { error: err.message });
  }

  next();
};

const requireAdmin = requireRole('admin');

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VISITOR_HEADER = 'x-visitor-id';

/**
 * Resolve a stable anonymous identity and expose it as `req.visitorId`.
 *
 * Personalization needs a durable id for guests: without one every anonymous
 * request looks like a first-time visitor, so no taste profile can ever form.
 * Pair with `optionalAuth` on public routes — signed-in users get both a
 * `req.user` and a `req.visitorId`, which lets a guest's pre-login history be
 * merged into their account later.
 *
 * Two transports, in order of trust:
 *   1. `visitor_id` cookie — browsers. HttpOnly, so page scripts cannot read it.
 *   2. `X-Visitor-Id` header — native clients (React Native / Expo) which do not
 *      persist cookies; the app generates a UUID once and stores it locally.
 *      Cookies are preferred when both are present.
 *
 * The incoming value is validated as a UUID before it is trusted. It reaches
 * Mongo queries and a unique index key, so a hand-crafted cookie or header must
 * not be able to smuggle arbitrary strings (or non-string types) through. The id
 * itself is unguessable (122 bits) and grants access to nothing but an anonymous
 * recommendation feed, so client-supplied values are acceptable here.
 *
 * A valid id is never rotated — the cookie is only (re)issued when missing or
 * malformed, so repeat visits keep accumulating one profile.
 */
const attachVisitorId = (req, res, next) => {
  const fromCookie = req.cookies?.[VISITOR_COOKIE];
  if (typeof fromCookie === 'string' && UUID_V4_PATTERN.test(fromCookie)) {
    req.visitorId = fromCookie;
    return next();
  }

  // Native clients manage their own id; do not issue a cookie they cannot keep.
  const fromHeader = req.headers[VISITOR_HEADER];
  if (typeof fromHeader === 'string' && UUID_V4_PATTERN.test(fromHeader)) {
    req.visitorId = fromHeader;
    return next();
  }

  const visitorId = uuidv4();
  req.visitorId = visitorId;
  setVisitorCookie(res, visitorId);
  next();
};

module.exports = {
  requireAuth,
  requireRole,
  requireAdmin,
  optionalAuth,
  attachVisitorId
};
