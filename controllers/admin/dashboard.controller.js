const dashboardService = require('../../services/admin/dashboard.service');

const recentProperties = async (req, res) => {
  try {
    const data = await dashboardService.recentProperties();
    res.json(data);
  } catch (err) {
    console.error('Error fetching recent properties', err);
    res.status(500).json({ error: 'Failed to fetch recent properties' });
  }
};

const stats = async (req, res) => {
  try {
    const data = await dashboardService.stats();
    res.json(data);
  } catch (err) {
    console.error('Error fetching dashboard stats', err);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
};

const recentInquiries = async (req, res) => {
  try {
    const data = await dashboardService.recentInquiries();
    res.json(data);
  } catch (err) {
    console.error('Error fetching recent inquiries', err);
    res.status(500).json({ error: 'Failed to fetch recent inquiries' });
  }
};

const monthlyEarnings = async (req, res) => {
  try {
    const data = await dashboardService.monthlyEarnings();
    res.json(data);
  } catch (err) {
    console.error('Error fetching monthly earnings', err);
    res.status(500).json({ error: 'Failed to fetch monthly earnings' });
  }
};

const earningsOverview = async (req, res) => {
  try {
    const data = await dashboardService.earningsOverview();
    res.json(data);
  } catch (err) {
    console.error('Error fetching earnings overview', err);
    res.status(500).json({ months: [], earnings: [], error: 'Failed to fetch earnings overview' });
  }
};

module.exports = {
  recentProperties,
  stats,
  recentInquiries,
  monthlyEarnings,
  earningsOverview
};
