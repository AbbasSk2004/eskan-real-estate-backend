const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../../middleware/auth');
const agentsController = require('../../controllers/admin/agents.controller');

const requireAdmin = requireRole('admin');
router.use(requireAuth);
router.use(requireAdmin);

router.get('/approved', agentsController.getApprovedAgents);
router.get('/applications', agentsController.getAgentApplications);
router.patch('/applications/:id', agentsController.updateAgentApplication);

router.patch('/agents/:id/feature', agentsController.setAgentFeatured);
router.put('/agents/:id/feature', agentsController.setAgentFeatured);

router.patch('/agents/:id', agentsController.updateAgent);
router.put('/agents/:id', agentsController.updateAgent);
router.delete('/agents/:id', agentsController.deleteAgent);

module.exports = router;
