const User = require('../models/user.model');

const { uploadToCloudinary } = require('../utils/cloudinaryUpload');

const sanitizeUser = (user) => {
  if (!user) return null;
  const obj = user.toObject ? user.toObject() : { ...user };
  const { passwordHash, refreshTokens, __v, ...rest } = obj;

  const normalizeProfilePhoto = (photo) => {
    if (!photo) return null;
    if (typeof photo === 'string') return photo;
    if (typeof photo === 'object') {
      return (
        photo.url ||
        photo.secure_url ||
        photo.path ||
        photo.src ||
        photo.image_url ||
        null
      );
    }
    return null;
  };

  const profilePhotoObject = rest.profilePhoto || rest.profile_photo || null;
  const profilePhotoUrl = normalizeProfilePhoto(profilePhotoObject);

  // Provide snake_case fields for the frontend while keeping camelCase for compatibility
  return {
    id: rest._id || rest.id,
    firstname: rest.firstName || rest.firstname || null,
    lastname: rest.lastName || rest.lastname || null,
    email: rest.email || null,
    phone: rest.phone || null,
    profile_photo: profilePhotoUrl,
    role: rest.role || null,
    status: rest.status || null,
    is_featured: rest.isFeatured || rest.is_featured || false,

    // Keep camelCase properties for other consumers
    firstName: rest.firstName || rest.firstname || null,
    lastName: rest.lastName || rest.lastname || null,
    profilePhoto: profilePhotoObject
  };
};

const authService = require('./auth.service');

const getProfile = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    const err = new Error('Profile not found');
    err.code = 'PROFILE_NOT_FOUND';
    throw err;
  }
  return sanitizeUser(user);
};

const updateProfile = async (userId, updateData = {}) => {
  // Normalize legacy keys (snake_case) to our schema's camelCase
  const normalized = {
    ...updateData,
    firstName: updateData.firstName || updateData.firstname,
    lastName: updateData.lastName || updateData.lastname,
    profilePhoto: updateData.profilePhoto || updateData.profile_photo || updateData.profilePhotoFile
  };

  // Handle uploaded file (multer) if provided
  if (normalized.profilePhoto && normalized.profilePhoto.buffer) {
    try {
      const file = normalized.profilePhoto;
      const result = await uploadToCloudinary({
        buffer: file.buffer,
        filename: file.originalname || `profile_${Date.now()}`,
        folder: 'profile_photos',
        resourceType: 'image'
      });

      normalized.profilePhoto = {
        url: result.secure_url || result.url,
        publicId: result.public_id || result.publicId
      };
    } catch (err) {
      console.error('Failed to upload profile photo', err);
      // Continue without failing the profile update
      delete normalized.profilePhoto;
    }
  }

  const allowedFields = ['firstName', 'lastName', 'phone', 'profilePhoto', 'status'];
  const payload = {};

  allowedFields.forEach((field) => {
    if (normalized[field] !== undefined) {
      payload[field] = normalized[field];
    }
  });

  const user = await User.findByIdAndUpdate(userId, { $set: payload }, { new: true });
  if (!user) {
    const err = new Error('Profile not found');
    err.code = 'PROFILE_NOT_FOUND';
    throw err;
  }
  return sanitizeUser(user);
};

const changePassword = async (userId, currentPassword, newPassword) => {
  const user = await User.findById(userId);
  if (!user) {
    const err = new Error('Profile not found');
    err.code = 'PROFILE_NOT_FOUND';
    throw err;
  }

  if (!user.passwordHash) {
    const err = new Error('Password is not set for this account');
    err.code = 'PASSWORD_NOT_SET';
    throw err;
  }

  const isMatch = await authService.comparePassword(currentPassword, user.passwordHash);
  if (!isMatch) {
    const err = new Error('Current password is incorrect');
    err.code = 'INVALID_CURRENT_PASSWORD';
    throw err;
  }

  // Basic strength check - adjust as needed
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    const err = new Error('New password must be at least 8 characters long');
    err.code = 'WEAK_PASSWORD';
    throw err;
  }

  user.passwordHash = await authService.hashPassword(newPassword);
  // Invalidate existing refresh tokens so old sessions cannot be reused
  user.refreshTokens = [];
  await user.save();

  return sanitizeUser(user);
};

module.exports = {
  getProfile,
  updateProfile,
  changePassword
};
