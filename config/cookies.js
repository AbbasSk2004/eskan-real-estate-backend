/**
 * Shared HttpOnly cookie configuration for cross-origin authentication
 * (frontend on Vercel, backend on Render).
 *
 * SameSite=None + Secure is required because the cookie is set by the
 * backend origin and must be sent back to it from a different root domain.
 */

const TOKEN_COOKIE = 'token';
const REFRESH_TOKEN_COOKIE = 'refresh_token';
const ADMIN_TOKEN_COOKIE = 'admin_token';
const ADMIN_REFRESH_TOKEN_COOKIE = 'admin_refresh_token';
const VISITOR_COOKIE = 'visitor_id';

const parseExpiryMs = (value, fallbackMs) => {
  const match = /^(\d+)([smhd])$/.exec(value || '');
  if (!match) return fallbackMs;
  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return Number(match[1]) * (multipliers[match[2]] || 0);
};

// Keep cookie lifetimes aligned with the underlying token lifetimes.
const ACCESS_COOKIE_MAX_AGE = parseExpiryMs(process.env.JWT_EXPIRES_IN, 15 * 60 * 1000);
const REFRESH_COOKIE_MAX_AGE = parseExpiryMs(process.env.REFRESH_TOKEN_EXPIRES_IN, 30 * 24 * 60 * 60 * 1000);

// Production default: Secure + SameSite=None (required cross-origin, e.g.
// frontend on Vercel -> backend on Render). For local development over plain
// http on a non-localhost host (LAN IP, tunnel, etc.) browsers refuse to
// store Secure cookies and also refuse SameSite=None without Secure — set
// COOKIE_SECURE=false to fall back to SameSite=Lax (same-site XHR still
// carries these cookies, and the X-Requested-With CSRF guard stays active).
const useSecureCookies = process.env.COOKIE_SECURE !== 'false';

const baseCookieOptions = {
  httpOnly: true,
  secure: useSecureCookies,
  sameSite: useSecureCookies ? 'none' : 'lax',
  path: '/'
};

const cookieNamesForScope = (scope) => {
  const isAdmin = scope === 'admin';
  return {
    token: isAdmin ? ADMIN_TOKEN_COOKIE : TOKEN_COOKIE,
    refresh: isAdmin ? ADMIN_REFRESH_TOKEN_COOKIE : REFRESH_TOKEN_COOKIE
  };
};

const setAuthCookies = (res, tokens, scope = 'user') => {
  const names = cookieNamesForScope(scope);
  res.cookie(names.token, tokens.accessToken, { ...baseCookieOptions, maxAge: ACCESS_COOKIE_MAX_AGE });
  res.cookie(names.refresh, tokens.refreshToken, { ...baseCookieOptions, maxAge: REFRESH_COOKIE_MAX_AGE });
};

const clearAuthCookies = (res, scope = 'user') => {
  const names = cookieNamesForScope(scope);
  res.clearCookie(names.token, baseCookieOptions);
  res.clearCookie(names.refresh, baseCookieOptions);
};

// Anonymous visitor id. Long-lived on purpose: a guest's taste profile is
// built from their view history, so rotating this cookie would reset their
// recommendations to cold-start on every session. HttpOnly because no client
// code ever needs to read it — only the API correlates views by it.
const VISITOR_COOKIE_MAX_AGE = 365 * 24 * 60 * 60 * 1000; // 1 year

const setVisitorCookie = (res, visitorId) => {
  res.cookie(VISITOR_COOKIE, visitorId, { ...baseCookieOptions, maxAge: VISITOR_COOKIE_MAX_AGE });
};

module.exports = {
  TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  ADMIN_TOKEN_COOKIE,
  ADMIN_REFRESH_TOKEN_COOKIE,
  VISITOR_COOKIE,
  setAuthCookies,
  clearAuthCookies,
  setVisitorCookie
};