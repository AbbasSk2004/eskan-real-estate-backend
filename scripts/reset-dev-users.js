#!/usr/bin/env node

/**
 * Dev-only script to reset known test user passwords.
 *
 * This script is intentionally safe:
 * - It only runs when NODE_ENV === 'development'
 * - It only touches users explicitly listed in DEV_TEST_USER_EMAILS
 * - It never stores plaintext passwords in the database
 *
 * Usage:
 *   NODE_ENV=development node scripts/reset-dev-users.js
 *
 * Optional environment variables:
 *   DEV_TEST_USER_EMAILS  - comma-separated list of emails to reset (required)
 *   DEV_TEST_PASSWORD     - password to set (default: 123456789)
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const bcrypt = require('bcrypt');
const { connectToMongo, disconnectMongo } = require('../config/mongo');
const User = require('../models/user.model');

const run = async () => {
  if (process.env.NODE_ENV !== 'development') {
    console.error('This script can only be run in development mode (NODE_ENV=development).');
    process.exit(1);
  }

  const rawEmails = process.env.DEV_TEST_USER_EMAILS || '';
  const password = process.env.DEV_TEST_PASSWORD || '123456789';

  const emails = rawEmails
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);

  if (!emails.length) {
    console.error('No DEV_TEST_USER_EMAILS provided. Set DEV_TEST_USER_EMAILS in your .env file.');
    process.exit(1);
  }

  await connectToMongo();

  try {
    const passwordHash = await bcrypt.hash(password, parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10));

    for (const email of emails) {
      const user = await User.findOne({ email });
      if (!user) {
        console.warn(`User not found for email: ${email}`);
        continue;
      }

      user.passwordHash = passwordHash;
      user.emailVerified = true;
      // Reset refresh tokens so existing sessions are invalidated
      user.refreshTokens = [];

      await user.save();
      console.log(`Updated user ${email} (id: ${user._id})`);
    }

    console.log('Dev user password reset complete.');
  } catch (err) {
    console.error('Error resetting dev users:', err);
    process.exit(1);
  } finally {
    await disconnectMongo();
    process.exit(0);
  }
};

run();
