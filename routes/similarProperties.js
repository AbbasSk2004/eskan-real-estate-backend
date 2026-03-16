const express = require('express');
const router = express.Router();
const similarPropertiesController = require('../controllers/similarProperties.controller');

router.get('/:id', similarPropertiesController.getSimilarProperties);

module.exports = router;
