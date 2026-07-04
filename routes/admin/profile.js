const express = require('express');
const multer = require('multer');
const router = express.Router();
const { requireAuth, requireRole } = require('../../middleware/auth');
const profileController = require('../../controllers/profile.controller');

const requireAdmin = requireRole('admin');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

router.use(requireAuth);
router.use(requireAdmin);

router.get('/', profileController.getProfile);
router.put(
  '/',
  upload.fields([
    { name: 'profile_photo', maxCount: 1 },
    { name: 'profilePhoto', maxCount: 1 }
  ]),
  profileController.updateProfile
);
router.post('/change-password', profileController.changePassword);

module.exports = router;
