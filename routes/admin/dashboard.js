const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../../middleware/auth');
const dashboardController = require('../../controllers/admin/dashboard.controller');

const requireAdmin = requireRole('admin');
router.use(requireAuth);
router.use(requireAdmin);

router.get('/recent-properties', dashboardController.recentProperties);
router.get('/stats', dashboardController.stats);
router.get('/recent-inquiries', dashboardController.recentInquiries);
router.get('/monthly-earnings', dashboardController.monthlyEarnings);
router.get('/earnings-overview', dashboardController.earningsOverview);

module.exports = router;
