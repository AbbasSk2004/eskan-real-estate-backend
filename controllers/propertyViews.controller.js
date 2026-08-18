const propertyViewsService = require('../services/propertyViews.service');

// Behind a proxy (Render), req.ip is only trustworthy because index.js sets
// `trust proxy` in production; the header fallbacks cover local/direct runs.
const resolveClientIp = (req) =>
  req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress;

const recordPropertyView = async (req, res) => {
  try {
    const result = await propertyViewsService.recordView({
      propertyId: req.params.id,
      userId: req.user?._id,
      visitorId: req.visitorId,
      ipAddress: resolveClientIp(req)
    });

    if (!result) {
      return res.status(404).json({ success: false, message: 'Property not found' });
    }

    res.status(201).json({ success: true, data: result });
  } catch (err) {
    console.error('Error recording property view', err);
    res.status(500).json({ success: false, message: 'Failed to record property view' });
  }
};

const getViewCount = async (req, res) => {
  try {
    const propertyId = req.params.id;
    if (!propertyId) {
      return res.status(400).json({ success: false, message: 'Property ID is required' });
    }

    const count = await propertyViewsService.getViewCount(propertyId);
    if (count === null) {
      return res.status(404).json({ success: false, message: 'Property not found' });
    }

    res.json({ success: true, data: { count } });
  } catch (err) {
    console.error('Error getting property view count', err);
    res.status(500).json({ success: false, message: 'Failed to get property view count' });
  }
};

const getUserTotalViews = async (req, res) => {
  try {
    const userId = req.user?._id;
    const total = await propertyViewsService.getUserTotalViews(userId);
    res.json({ success: true, data: { total } });
  } catch (err) {
    console.error('Error getting user total views', err);
    res.status(500).json({ success: false, message: 'Failed to get user total views' });
  }
};

module.exports = {
  recordPropertyView,
  getViewCount,
  getUserTotalViews
};
