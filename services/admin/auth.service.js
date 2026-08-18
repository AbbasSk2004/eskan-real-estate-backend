const authService = require('../../services/auth.service');
const User = require('../../models/user.model');

const validateAdminUser = (user) => {
  if (!user) {
    const err = new Error('User not found');
    err.code = 'USER_NOT_FOUND';
    err.status = 404;
    throw err;
  }
  if (user.role !== 'admin') {
    const err = new Error('Access denied. Admin privileges required.');
    err.code = 'ACCESS_DENIED';
    err.status = 403;
    throw err;
  }
  return user;
};

const login = async ({ email, password }) => {
  const user = await authService.authenticateUser({ email, password });
  validateAdminUser(user);

  user.status = 'active';
  user.emailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationTokenExpires = undefined;
  user.lastLoginAt = new Date();
  await user.save();

  return authService.createSession(user);
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
