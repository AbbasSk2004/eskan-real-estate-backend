const bcrypt = require('bcrypt');
const User = require('../../models/user.model');
const { uploadToCloudinary, deleteFromCloudinary, PROFILES_ROOT } = require('../../utils/cloudinaryUpload');

// Normalizes a User document into the admin-panel UI contract:
// profiles_id / firstname / lastname / profile_photo / created_at.
const toAdminUserJson = (user) => {
  if (!user) return null;
  const doc = user.toObject ? user.toObject() : user;
  return {
    id: doc._id,
    profiles_id: doc._id,
    firstname: doc.firstName || null,
    lastname: doc.lastName || null,
    email: doc.email || null,
    phone: doc.phone || null,
    role: doc.role || 'user',
    // Presence: `status` is online/offline. `is_online` applies the freshness
    // window (see user.model.js) so a session stranded by a crash or restart
    // does not read as online forever. An unknown status means offline.
    status: doc.status || 'inactive',
    is_online: Boolean(doc.isOnline),
    last_seen_at: doc.lastSeenAt || null,
    profile_photo: (doc.profilePhoto && doc.profilePhoto.url) || null,
    created_at: doc.createdAt || null
  };
};

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

  return (await User.find(filter).sort({ createdAt: -1 })).map(toAdminUserJson);
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
  return toAdminUserJson(newUser);
};

const getUser = async (id) => {
  return toAdminUserJson(await User.findById(id));
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
  return toAdminUserJson(user);
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

  const folder = PROFILES_ROOT;
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
