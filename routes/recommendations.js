const express = require('express');
const router = express.Router();
const recommendationController = require('../controllers/recommendation.controller');

// Local recommendations (used by the frontend to power "for you" style recommendations)
router.post('/local', recommendationController.getLocalRecommendations);

module.exports = router;
