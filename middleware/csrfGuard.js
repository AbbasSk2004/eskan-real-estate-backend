/**
 * CSRF defense for the cross-origin cookie architecture.
 *
 * SameSite=None cookies are sent on every cross-origin request, so we enforce
 * a custom request header (X-Requested-With) on all state-changing requests:
 *   - HTML <form> attacks cannot attach custom headers -> rejected.
 *   - fetch/XHR attacks trigger a CORS preflight for the custom header, and
 *     the strict origin whitelist blocks them before the request fires.
 *
 * Safe methods are ignored; beacon endpoints are exempt because
 * navigator.sendBeacon() cannot attach custom headers (they are best-effort
 * presence updates with negligible CSRF impact).
 */

const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

// Endpoints invoked with navigator.sendBeacon(), which cannot carry headers.
const BEACON_EXEMPT_PATHS = ['/api/auth/update-status', '/api/admin/auth/logout-beacon'];

const csrfGuard = (req, res, next) => {
  if (SAFE_METHODS.includes(req.method)) {
    return next();
  }

  if (BEACON_EXEMPT_PATHS.includes(req.path)) {
    return next();
  }

  const requestedWith = req.headers['x-requested-with'];
  if (!requestedWith || requestedWith !== 'XMLHttpRequest') {
    console.warn(`[Security] Blocked potential CSRF attempt from origin: ${req.headers.origin || 'unknown'} path: ${req.originalUrl}`);
    return res.status(403).json({
      success: false,
      message: 'Forbidden: Missing or invalid CSRF protection header.'
    });
  }

  next();
};

module.exports = csrfGuard;