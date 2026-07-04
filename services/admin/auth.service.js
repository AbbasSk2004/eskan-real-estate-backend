const authService = require('../../services/auth.service');
const User = require('../../models/user.model');

const validateAdminUser = (user) => {
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  if (user.role !== 'admin') {
    const err = new Error('Access denied. Admin privileges required.');
    err.status = 403;
    throw err;
  }
  return user;
};

const login = async ({ email, password }) => {
  const { user: sanitizedUser, tokens } = await authService.login({ email, password });
  
  // Fetch the full user document to update status and lastLoginAt
  const user = await User.findById(sanitizedUser.id || sanitizedUser._id);
  validateAdminUser(user);

  user.status = 'active';
  user.lastLoginAt = new Date();
  await user.save();

  // Return the sanitized user again
  return { user: sanitizedUser, tokens };
};

const logout = async (user) => {
  validateAdminUser(user);
  user.refreshTokens = [];
  user.status = 'inactive';
  await user.save();
  return true;
};

const status = async (user) => {
  const adminUser = validateAdminUser(user);
  adminUser.status = 'active';
  await adminUser.save();
  return { id: adminUser._id, email: adminUser.email, role: adminUser.role };
};

module.exports = {
  login,
  logout,
  status
};
