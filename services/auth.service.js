const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const User = require('../models/user.model');
const emailService = require('./email.service');

const JWT_SECRET = process.env.JWT_SECRET;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET;
const ACCESS_TOKEN_EXPIRY = process.env.JWT_EXPIRES_IN || '15m';
const REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRES_IN || '30d';
const EMAIL_VERIFICATION_EXPIRY_MINUTES = parseInt(process.env.EMAIL_VERIFICATION_EXPIRY_MINUTES || '15', 10);

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET must be set');
}
if (!REFRESH_TOKEN_SECRET) {
  throw new Error('REFRESH_TOKEN_SECRET must be set');
}

const hashPassword = async (password) => {
  const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10);
  return bcrypt.hash(password, saltRounds);
};

const comparePassword = async (password, hash) => {
  return bcrypt.compare(password, hash);
};

const sanitizeUser = (user) => {
  if (!user) return null;
  // Convert Mongoose document to plain object and remove sensitive fields
  const obj = user.toObject ? user.toObject() : { ...user };
  const { passwordHash, refreshTokens, __v, ...rest } = obj;
  return rest;
};

const signAccessToken = (user) => {
  const payload = {
    sub: user._id,
    role: user.role
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRY
  });
};

const signRefreshToken = () => {
  return crypto.randomBytes(64).toString('hex');
};

const generateTokens = async (user) => {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken();

  const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
  const expiresAt = new Date(Date.now() + msToMs(REFRESH_TOKEN_EXPIRY));

  // Store refresh token hash in user document for revocation / rotation
  user.refreshTokens = user.refreshTokens || [];
  user.refreshTokens.push({ hash: hashedRefreshToken, expiresAt });

  // Keep only latest 10 tokens
  if (user.refreshTokens.length > 10) {
    user.refreshTokens = user.refreshTokens.slice(-10);
  }

  await user.save();

  return { accessToken, refreshToken, expiresAt };
};

const msToMs = (value) => {
  // Simple parser for values like '7d', '30m'
  const match = /^([0-9]+)([smhd])$/.exec(value);
  if (!match) return 0;
  const num = Number(match[1]);
  const unit = match[2];
  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return num * (multipliers[unit] || 0);
};

const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const hashOtp = async (otp) => {
  const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10);
  return bcrypt.hash(otp, saltRounds);
};

const generateEmailVerificationToken = async (user) => {
  const otp = generateOtp();
  const hashedOtp = await hashOtp(otp);
  user.emailVerificationToken = hashedOtp;
  user.emailVerificationTokenExpires = new Date(Date.now() + EMAIL_VERIFICATION_EXPIRY_MINUTES * 60_000);
  await user.save();
  return otp;
};

const sendVerificationEmail = async (user, otp) => {
  const subject = 'Verify your Eskan Real Estate account';
  const text = `Your verification code is ${otp}. It expires in ${EMAIL_VERIFICATION_EXPIRY_MINUTES} minutes.`;
  const html = `<p>Your verification code is <strong>${otp}</strong>.</p><p>This code will expire in ${EMAIL_VERIFICATION_EXPIRY_MINUTES} minutes.</p>`;
  await emailService.sendMail({ to: user.email, subject, text, html });
};

const verifyEmailOtp = async ({ email, token }) => {
  if (!email || !token) {
    const err = new Error('Email and token are required');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const normalizedEmail = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    const err = new Error('User not found');
    err.code = 'USER_NOT_FOUND';
    throw err;
  }

  if (user.emailVerified) {
    // If already verified, just return tokens
    const tokens = await generateTokens(user);
    const sanitizedUser = sanitizeUser(user);
    return { user: sanitizedUser, tokens };
  }

  if (!user.emailVerificationToken || !user.emailVerificationTokenExpires) {
    const err = new Error('Verification code not found. Please request a new code.');
    err.code = 'INVALID_OTP';
    throw err;
  }

  if (user.emailVerificationTokenExpires < new Date()) {
    const err = new Error('Verification code has expired. Please request a new code.');
    err.code = 'OTP_EXPIRED';
    throw err;
  }

  const isValid = await bcrypt.compare(token, user.emailVerificationToken);
  if (!isValid) {
    const err = new Error('Invalid verification code');
    err.code = 'INVALID_OTP';
    throw err;
  }

  user.emailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationTokenExpires = undefined;
  await user.save();

  const tokens = await generateTokens(user);
  const sanitizedUser = sanitizeUser(user);

  return { user: sanitizedUser, tokens };
};

const resendEmailVerification = async ({ email }) => {
  if (!email) {
    const err = new Error('Email is required');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const normalizedEmail = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    const err = new Error('User not found');
    err.code = 'USER_NOT_FOUND';
    throw err;
  }

  if (user.emailVerified) {
    const err = new Error('Email is already verified');
    err.code = 'ALREADY_VERIFIED';
    throw err;
  }

  const otp = await generateEmailVerificationToken(user);
  await sendVerificationEmail(user, otp);

  return { success: true };
};

const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    console.warn('Access token verification failed', { error: err.message });
    return null;
  }
};

const verifyRefreshToken = async (user, refreshToken) => {
  if (!user?.refreshTokens?.length) return false;

  const now = new Date();
  // Remove expired tokens
  user.refreshTokens = user.refreshTokens.filter(rt => rt.expiresAt > now);

  // Find match
  const match = await Promise.all(
    user.refreshTokens.map(async (rt) => {
      const matchToken = await bcrypt.compare(refreshToken, rt.hash);
      return matchToken ? rt : null;
    })
  );

  const found = match.find(Boolean);
  if (!found) {
    await user.save();
    return false;
  }

  // Keep this token and remove others if you want strict rotation
  user.refreshTokens = user.refreshTokens.filter(rt => rt === found);
  await user.save();
  return true;
};

const register = async ({ email, password, firstName, lastName, phone }) => {
  const normalizedEmail = email.toLowerCase().trim();
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    const err = new Error('Email already in use');
    err.code = 'EMAIL_EXISTS';
    throw err;
  }

  const passwordHash = await hashPassword(password);
  const user = new User({
    email: normalizedEmail,
    passwordHash,
    firstName,
    lastName,
    phone,
    emailVerified: false
  });

  await user.save();

  // Generate OTP and send verification email
  const otp = await generateEmailVerificationToken(user);
  try {
    await sendVerificationEmail(user, otp);
  } catch (err) {
    // If sending the verification email fails, delete the user to avoid orphaned accounts
    await User.deleteOne({ _id: user._id });
    const sendErr = new Error('Failed to send verification email');
    sendErr.code = 'EMAIL_SEND_FAILED';
    throw sendErr;
  }

  const sanitizedUser = sanitizeUser(user);
  return { user: sanitizedUser, verificationRequired: true };
};

const login = async ({ email, password }) => {
  const normalizedEmail = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    const err = new Error('Invalid credentials');
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  if (!user.emailVerified && user.role !== 'admin') {
    const err = new Error('Email not verified. Please check your inbox for the verification code.');
    err.code = 'EMAIL_NOT_VERIFIED';
    throw err;
  }

  if (!user.passwordHash) {
    const err = new Error('Password not set, please reset your password');
    err.code = 'PASSWORD_NOT_SET';
    throw err;
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    const err = new Error('Invalid credentials');
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  user.lastLoginAt = new Date();
  await user.save();

  const tokens = await generateTokens(user);
  const sanitizedUser = sanitizeUser(user);

  return { user: sanitizedUser, tokens };
};

const refresh = async ({ userId, refreshToken }) => {
  if (!refreshToken) {
    const err = new Error('Refresh token is required');
    err.code = 'MISSING_REFRESH_TOKEN';
    throw err;
  }

  if (!userId) {
    const err = new Error('User ID is required');
    err.code = 'MISSING_USER_ID';
    throw err;
  }

  const user = await User.findById(userId);
  if (!user) {
    const err = new Error('User not found');
    err.code = 'USER_NOT_FOUND';
    throw err;
  }

  const valid = await verifyRefreshToken(user, refreshToken);
  if (!valid) {
    const err = new Error('Invalid refresh token');
    err.code = 'INVALID_REFRESH_TOKEN';
    throw err;
  }

  const tokens = await generateTokens(user);
  const sanitizedUser = sanitizeUser(user);
  return { user: sanitizedUser, tokens };
};

const revokeRefreshToken = async (userId, refreshToken) => {
  const user = await User.findById(userId);
  if (!user) return;

  if (!user.refreshTokens || user.refreshTokens.length === 0) return;

  // Remove matching refresh token hashes
  const updatedTokens = [];
  for (const rt of user.refreshTokens) {
    const match = await bcrypt.compare(refreshToken, rt.hash);
    if (!match) {
      updatedTokens.push(rt);
    }
  }

  user.refreshTokens = updatedTokens;
  await user.save();
};

module.exports = {
  register,
  login,
  refresh,
  verifyAccessToken,
  revokeRefreshToken,
  comparePassword,
  hashPassword,
  verifyEmailOtp,
  resendEmailVerification
};
