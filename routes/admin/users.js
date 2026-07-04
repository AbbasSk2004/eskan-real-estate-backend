const express = require('express');
const router = express.Router();
const multer = require('multer');
const { requireAuth, requireRole } = require('../../middleware/auth');
const {
  listUsers,
  createUser,
  getUser,
  updateUser,
  deleteUser,
  uploadProfileImage,
  deleteProfileImage
} = require('../../controllers/admin/users.controller');

const requireAdmin = requireRole('admin');

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }
});

// All routes in this file require authenticated admin
router.use(requireAuth);
router.use(requireAdmin);

router.get('/', listUsers);
router.post('/', createUser);
router.get('/:id', getUser);
router.put('/:id', updateUser);
router.delete('/:id', deleteUser);

router.post('/upload-profile-image', upload.single('profile_image'), uploadProfileImage);
router.delete('/delete-profile-image', deleteProfileImage);

module.exports = router;
