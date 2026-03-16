const propertyService = require('../services/property.service');

/**
 * Return recommended properties based on local user data.
 * This endpoint is intended to provide a lightweight fallback for
 * clients that cannot access a full ML recommendation service.
 */
const getLocalRecommendations = async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(Number(req.body.limit) || 5, 50));

    // Currently, this endpoint does not use the provided viewed_properties or preferences.
    // It is primarily a compatibility shim for legacy clients.
    const data = await propertyService.getRecommendedProperties(limit);

    res.json({ success: true, data, source: 'legacy' });
  } catch (err) {
    console.error('Error fetching local recommendations', err);
    res.status(500).json({ success: false, message: 'Failed to fetch recommendations' });
  }
};

module.exports = {
  getLocalRecommendations
};
