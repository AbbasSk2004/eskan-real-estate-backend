const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const agentController = require('../controllers/agent.controller');

// Public endpoints
router.get('/', agentController.listAgents);
router.get('/featured', agentController.listFeaturedAgents);
router.get('/:id', agentController.getAgent);

// Authenticated user endpoints
router.get('/applications/details', requireAuth, agentController.getApplicationDetails);
router.post('/applications', requireAuth, agentController.handleUpload, agentController.submitApplication);

module.exports = router;
