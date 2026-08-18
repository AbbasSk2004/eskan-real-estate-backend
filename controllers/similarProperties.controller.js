const similarPropertiesService = require('../services/similarProperties.service');

const getSimilarProperties = async (req, res) => {
  try {
    const { id } = req.params;
    const limit = Number(req.query.limit) || 4;
    const data = await similarPropertiesService.getSimilarProperties(id, limit);
    res.json({ success: true, data });
  } catch (err) {
    console.error('Error fetching similar properties', err);
    res.status(500).json({ success: false, message: 'Failed to fetch similar properties' });
  }
};

module.exports = {
  getSimilarProperties
};
