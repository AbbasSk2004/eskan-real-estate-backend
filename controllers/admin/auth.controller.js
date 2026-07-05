const adminAuthService = require('../../services/admin/auth.service');

const login = async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'validation_error', message: 'Missing email or password' });
    }

    const { user, tokens } = await adminAuthService.login({ email, password });
    const { accessToken, refreshToken, expiresAt } = tokens;

    return res.json({
      success: true,
      token: accessToken,
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt,
      user: {
        id: user.id || user._id,
        email: user.email,
        role: user.role,
        firstname: user.firstName || user.firstname || '',
        lastname: user.lastName || user.lastname || '',
        profile_photo: user.profilePhoto?.url || ''
      }
    });
  } catch (err) {
    console.error('Admin login error', err);
    const errorCode = err.code || 'server_error';
    const statusByCode = {
      INVALID_CREDENTIALS: 401,
      EMAIL_NOT_VERIFIED: 403,
      PASSWORD_NOT_SET: 400,
      ACCESS_DENIED: 403,
      USER_NOT_FOUND: 404
    };
    const status = err.status || statusByCode[errorCode] || 500;
    return res.status(status).json({ success: false, error: errorCode, message: err.message });
  }
};

const logout = async (req, res) => {
  try {
    await adminAuthService.logout(req.user);
    return res.json({ success: true, message: 'Logout successful' });
  } catch (err) {
    console.error('Admin logout error', err);
    return res.status(err.status || 500).json({ success: false, error: err.message || 'server_error' });
  }
};

const status = async (req, res) => {
  try {
    const user = await adminAuthService.status(req.user);
    return res.json({ authenticated: true, user });
  } catch (err) {
    console.error('Admin status error', err);
    return res.status(err.status || 500).json({ error: err.message || 'server_error' });
  }
};

module.exports = {
  login,
  logout,
  status
};
