const bcrypt = require('bcrypt');
const User = require('../../models/user.model');
const { uploadToCloudinary, deleteFromCloudinary } = require('../../utils/cloudinaryUpload');
const { buildFolderPath } = require('../../config/cloudinary');

const listUsers = async ({ search, role }) => {
  const filter = {};
  if (role && role !== 'all') {
    filter.role = role;
  }

  if (search) {
    const regex = new RegExp(search, 'i');
    filter.$or = [
      { firstName: regex },
      { lastName: regex },
      { email: regex }
    ];
  }

  return User.find(filter).sort({ createdAt: -1 });
};

const createUser = async ({ email, password, firstname, lastname, phone, role, profile_photo }) => {
  if (!email || !password || !firstname || !lastname) {
    const err = new Error('Missing required fields');
    err.status = 400;
    throw err;
  }

  const existing = await User.findOne({ email: email.toLowerCase().trim() });
  if (existing) {
    const err = new Error('Email already in use');
    err.status = 400;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const newUser = new User({
    email: email.toLowerCase().trim(),
    passwordHash,
    firstName: firstname,
    lastName: lastname,
    phone,
    role: role || 'user',
    status: 'active',
    emailVerified: true
  });

  if (profile_photo) {
    newUser.profilePhoto = profile_photo;
  }

  await newUser.save();
  return newUser;
};

const getUser = async (id) => {
  return User.findById(id);
};

const updateUser = async (id, data) => {
  const user = await User.findById(id);
  if (!user) return null;

  const updateData = {
    firstName: data.firstname,
    lastName: data.lastname,
    email: data.email,
    phone: data.phone,
    role: data.role
  };

  Object.keys(updateData).forEach((key) => {
    if (updateData[key] === undefined || updateData[key] === null) {
      delete updateData[key];
    }
  });

  Object.assign(user, updateData);
  await user.save();
  return user;
};

const deleteUser = async (id) => {
  const user = await User.findById(id);
  if (!user) return false;

  if (user.profilePhoto && user.profilePhoto.publicId) {
    await deleteFromCloudinary(user.profilePhoto.publicId).catch(() => {});
  }

  await user.deleteOne();
  return true;
};

const uploadProfileImage = async (userId, file) => {
  if (!file) {
    const err = new Error('No file uploaded');
    err.status = 400;
    throw err;
  }

  const user = await User.findById(userId);
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }

  const folder = buildFolderPath('profiles', user._id);
  const filename = `${Date.now()}`;
  const result = await uploadToCloudinary({ buffer: file.buffer, folder, filename, resourceType: 'image' });

  if (user.profilePhoto && user.profilePhoto.publicId) {
    await deleteFromCloudinary(user.profilePhoto.publicId).catch(() => {});
  }

  user.profilePhoto = {
    url: result.secure_url,
    publicId: result.public_id
  };
  await user.save();

  return { imageUrl: result.secure_url, user };
};

const deleteProfileImage = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }

  if (!user.profilePhoto || !user.profilePhoto.publicId) {
    const err = new Error('No profile image to delete');
    err.status = 400;
    throw err;
  }

  await deleteFromCloudinary(user.profilePhoto.publicId);
  user.profilePhoto = undefined;
  await user.save();

  return true;
};

module.exports = {
  listUsers,
  createUser,
  getUser,
  updateUser,
  deleteUser,
  uploadProfileImage,
  deleteProfileImage
};
