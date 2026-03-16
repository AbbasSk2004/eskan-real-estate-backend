const express = require('express');
const multer = require('multer');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const profileController = require('../controllers/profile.controller');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

// Get current authenticated user's profile
router.get('/', requireAuth, profileController.getProfile);

// Update current authenticated user's profile (supports multipart/form-data)
router.put(
  '/',
  requireAuth,
  upload.fields([
    { name: 'profile_photo', maxCount: 1 },
    { name: 'profilePhoto', maxCount: 1 }
  ]),
  profileController.updateProfile
);

// Change current authenticated user's password
router.post('/change-password', requireAuth, profileController.changePassword);

module.exports = router;
