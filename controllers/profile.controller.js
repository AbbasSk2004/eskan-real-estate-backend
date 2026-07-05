const profileService = require('../services/profile.service');

const getProfile = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'unauthorized', message: 'Authentication required' });
    }

    const user = await profileService.getProfile(userId);
    return res.json({ success: true, data: user });
  } catch (err) {
    console.error('Get profile error:', err);
    const status = err.code === 'PROFILE_NOT_FOUND' ? 404 : 500;
    return res.status(status).json({ success: false, error: err.code || 'server_error', message: err.message });
  }
};

const updateProfile = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'unauthorized', message: 'Authentication required' });
    }

      // Support multipart form-data uploads from the frontend
    const profilePhotoFile =
      (req.files?.profile_photo && req.files.profile_photo[0]) ||
      (req.files?.profilePhoto && req.files.profilePhoto[0]) ||
      null;

    const updated = await profileService.updateProfile(userId, {
      ...req.body,
      profilePhoto: profilePhotoFile
    });

    return res.json({ success: true, data: updated });
  } catch (err) {
    console.error('Update profile error:', err);
    const status = err.code === 'PROFILE_NOT_FOUND' ? 404 : 500;
    return res.status(status).json({ success: false, error: err.code || 'server_error', message: err.message });
  }
};

const changePassword = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'unauthorized', message: 'Authentication required' });
    }

    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_FIELDS',
        message: 'Both currentPassword and newPassword are required',
        field: !currentPassword ? 'currentPassword' : 'newPassword'
      });
    }

    await profileService.changePassword(userId, currentPassword, newPassword);

    return res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    const status = err.code === 'PROFILE_NOT_FOUND'
      ? 404
      : err.code === 'INVALID_CURRENT_PASSWORD'
        ? 400
        : 500;

    const payload = {
      success: false,
      error: err.code || 'server_error',
      message: err.message || 'Failed to change password'
    };

    if (err.code === 'INVALID_CURRENT_PASSWORD') {
      payload.field = 'currentPassword';
    }

    return res.status(status).json(payload);
  }
};

const uploadProfilePhoto = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'unauthorized', message: 'Authentication required' });
    }

    const profilePhotoFile =
      req.file ||
      (req.files?.profile_photo && req.files.profile_photo[0]) ||
      (req.files?.profilePhoto && req.files.profilePhoto[0]) ||
      null;

    if (!profilePhotoFile) {
      return res.status(400).json({ success: false, message: 'No profile photo uploaded' });
    }

    const updated = await profileService.updateProfile(userId, { profilePhoto: profilePhotoFile });

    return res.json({
      success: true,
      photoUrl: updated.profile_photo || updated.profilePhoto?.url || null,
      data: updated
    });
  } catch (err) {
    console.error('Upload profile photo error:', err);
    const status = err.code === 'PROFILE_NOT_FOUND' ? 404 : 500;
    return res.status(status).json({ success: false, error: err.code || 'server_error', message: err.message });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  changePassword,
  uploadProfilePhoto
};
