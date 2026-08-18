const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { requireAuth, optionalAuth, attachVisitorId } = require('../middleware/auth');
const propertyController = require('../controllers/property.controller');
const propertyViewsController = require('../controllers/propertyViews.controller');

// View telemetry is public and fires on every listing open, so it needs its own
// budget: the popularity component of the recommendation score is derived from
// these rows, and an unthrottled endpoint would let anyone inflate a listing.
// Per-day dedup in the service caps the damage; this caps the request volume.
const viewEventLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many view events, please slow down.' }
});

// Public endpoints
router.get('/featured', propertyController.getFeaturedProperties);

// Personalized ranking: needs a stable anonymous identity for guests and an
// optional session for signed-in users. Never gated — logged-out visitors get
// the trending variant of the same ranker.
router.get(
  '/recommended',
  attachVisitorId,
  optionalAuth,
  propertyController.getRecommendedProperties
);

router.get('/', propertyController.listProperties);

// Public view telemetry — the signal that feeds the recommendation taste
// profile. `attachVisitorId` guarantees a stable anonymous identity; then
// `optionalAuth` attributes the view to an account when a session exists but
// never rejects guests (this endpoint must work for logged-out traffic).
// Declared before `/:id` for readability — Express would not confuse them
// anyway, since `:id` only matches a single path segment.
router.post(
  '/:id/views',
  viewEventLimiter,
  attachVisitorId,
  optionalAuth,
  propertyViewsController.recordPropertyView
);
router.get('/:id/views/count', propertyViewsController.getViewCount);

// Authenticated user endpoints
router.get('/user/properties', requireAuth, propertyController.getUserProperties);
router.get('/:id', propertyController.getProperty);
router.post('/:id/favorites', requireAuth, propertyController.addFavorite);
router.post('/', requireAuth, propertyController.handleUpload, propertyController.createProperty);
router.delete('/:id', requireAuth, propertyController.deleteProperty);

module.exports = router;
