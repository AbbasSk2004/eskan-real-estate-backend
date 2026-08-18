const PropertyView = require('../models/propertyView.model');
const Property = require('../models/property.model');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;

// UTC-truncated day so the dedup bucket does not shift with the server's local
// timezone (Render/containers can differ from the dev machine).
const startOfUtcDay = (date = new Date()) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

/**
 * Resolve an id-or-slug path param to the canonical Property `_id`.
 *
 * The view endpoint is public, so the param is untrusted: without this check
 * anyone could POST arbitrary strings and fill the collection with orphan rows
 * that would then skew the popularity signal recommendations rank on. Returns
 * null when no such property exists, so the caller can answer 404.
 *
 * Kept lean (`select('_id').lean()`) rather than reusing
 * propertyService.getPropertyById, which populates the owner and builds the
 * full API response shape — wasted work on a high-frequency telemetry path.
 */
const resolvePropertyId = async (idOrSlug) => {
  if (typeof idOrSlug !== 'string' || !idOrSlug.trim()) return null;

  const value = idOrSlug.trim();
  const doc = UUID_PATTERN.test(value) || OBJECT_ID_PATTERN.test(value)
    ? await Property.findById(value).select('_id').lean()
    : await Property.findOne({ slug: value.toLowerCase() }).select('_id').lean();

  return doc?._id || null;
};

/**
 * Record a property view, deduplicated to one row per identity per UTC day.
 *
 * Identity precedence is visitorId (cookie) > ipAddress. IP alone is a poor
 * key — corporate NATs and mobile carriers collapse many people onto one
 * address, and a single address rotates across sessions — so the cookie is
 * preferred whenever the client can hold one.
 *
 * Returns null when the property does not exist.
 */
const recordView = async ({ propertyId, userId, visitorId, ipAddress }) => {
  const resolvedId = await resolvePropertyId(propertyId);
  if (!resolvedId) return null;

  const viewedDate = startOfUtcDay();
  const resolvedIp = ipAddress || 'unknown';

  // Only one identity key goes in the filter, so the matching unique index is
  // the one that actually guards this write.
  const identity = visitorId ? { visitorId } : { ipAddress: resolvedIp };

  const setOnInsert = { viewedAt: new Date() };
  if (visitorId) setOnInsert.ipAddress = resolvedIp;

  try {
    await PropertyView.updateOne(
      { propertyId: resolvedId, viewedDate, ...identity },
      {
        $setOnInsert: setOnInsert,
        // Back-fill the owning user when a guest signs in mid-session, so the
        // day's existing row is attributed to their account.
        ...(userId ? { $set: { userId } } : {})
      },
      { upsert: true }
    );
  } catch (err) {
    // Two concurrent first-views of the same listing race on the unique index.
    // Either way the row now exists, which is all this endpoint promises.
    if (err?.code !== 11000) throw err;
  }

  const count = await PropertyView.countDocuments({ propertyId: resolvedId });

  // A new view changes this visitor's taste profile, so their cached ranking is
  // now stale. Dropping it here means opening a listing and returning to the
  // homepage shows updated recommendations immediately rather than after the
  // cache TTL. Required lazily to keep the module graph acyclic — the ranker
  // reaches property.service, which must not depend back on this module.
  try {
    require('./recommendation.service').invalidateCacheForIdentity({ userId, visitorId });
  } catch (err) {
    console.warn('Failed to invalidate recommendation cache', { error: err.message });
  }

  return { count };
};

const getViewCount = async (propertyId) => {
  const resolvedId = await resolvePropertyId(propertyId);
  if (!resolvedId) return null;
  return PropertyView.countDocuments({ propertyId: resolvedId });
};

const getUserTotalViews = async (userId) => {
  return PropertyView.countDocuments({ userId });
};

module.exports = {
  recordView,
  getViewCount,
  getUserTotalViews,
  resolvePropertyId
};
