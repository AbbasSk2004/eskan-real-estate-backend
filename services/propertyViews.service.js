const PropertyView = require('../models/propertyView.model');

const recordView = async ({ propertyId, userId, ipAddress }) => {
  if (!propertyId) {
    throw new Error('Property ID is required to record a view');
  }

  const view = new PropertyView({
    propertyId,
    userId,
    ipAddress: ipAddress || 'unknown'
  });

  return view.save();
};

const getViewCount = async (propertyId) => {
  if (!propertyId) return 0;
  return PropertyView.countDocuments({ propertyId });
};

const getUserTotalViews = async (userId) => {
  if (!userId) return 0;
  return PropertyView.countDocuments({ userId });
};

module.exports = {
  recordView,
  getViewCount,
  getUserTotalViews
};
