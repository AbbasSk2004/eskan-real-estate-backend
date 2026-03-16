const propertyViewsService = require('../services/propertyViews.service');

const recordPropertyView = async (req, res) => {
  try {
    const propertyId = req.params.id;
    const userId = req.user?._id;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress;

    if (!propertyId) {
      return res.status(400).json({ success: false, message: 'Property ID is required' });
    }

    await propertyViewsService.recordView({ propertyId, userId, ipAddress });
    res.status(201).json({ success: true, data: { count: null } });
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
    res.json({ success: true, data: { count } });
  } catch (err) {
    console.error('Error fetching property view count', err);
    res.status(500).json({ success: false, message: 'Failed to fetch view count' });
  }
};

const getUserTotalViews = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.json({ success: true, data: { total: 0 } });
    }

    const total = await propertyViewsService.getUserTotalViews(userId);
    res.json({ success: true, data: { total } });
  } catch (err) {
    console.error('Error fetching user view count', err);
    res.status(500).json({ success: false, message: 'Failed to fetch user view counts' });
  }
};

module.exports = {
  recordPropertyView,
  getViewCount,
  getUserTotalViews
};
