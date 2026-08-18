const analyticsService = require('../../services/admin/analytics.service');

const overview = async (req, res) => {
  try {
    const data = await analyticsService.overview({
      startDate: req.query.startDate,
      endDate: req.query.endDate
    });
    res.json(data);
  } catch (err) {
    console.error('Error fetching analytics overview', err);
    res.status(500).json({ error: 'Failed to fetch analytics overview' });
  }
};

const propertyViewsByMonth = async (req, res) => {
  try {
    const data = await analyticsService.propertyViewsByMonth({
      startDate: req.query.startDate,
      endDate: req.query.endDate
    });
    res.json(data);
  } catch (err) {
    console.error('Error fetching property views data', err);
    res.status(500).json({ error: 'Failed to fetch property views data' });
  }
};

const propertyListingsByMonth = async (req, res) => {
  try {
    const data = await analyticsService.propertyListingsByMonth({
      startDate: req.query.startDate,
      endDate: req.query.endDate
    });
    res.json(data);
  } catch (err) {
    console.error('Error fetching property listings data', err);
    res.status(500).json({ error: 'Failed to fetch property listings data' });
  }
};

const propertyTypesDistribution = async (req, res) => {
  try {
    const data = await analyticsService.propertyTypesDistribution({
      startDate: req.query.startDate,
      endDate: req.query.endDate
    });
    res.json(data);
  } catch (err) {
    console.error('Error fetching property types data', err);
    res.status(500).json({ error: 'Failed to fetch property types data' });
  }
};

const topPerformingProperties = async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 5;
    const data = await analyticsService.topPerformingProperties({
      limit,
      startDate: req.query.startDate,
      endDate: req.query.endDate
    });
    res.json(data);
  } catch (err) {
    console.error('Error fetching top performing properties', err);
    res.status(500).json({ error: 'Failed to fetch top performing properties' });
  }
};

module.exports = {
  overview,
  propertyViewsByMonth,
  propertyListingsByMonth,
  propertyTypesDistribution,
  topPerformingProperties
};
