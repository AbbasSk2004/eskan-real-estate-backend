#!/usr/bin/env node
/**
 * Ensure an admin account exists with the expected email/password after migration.
 *
 * Usage:
 *   node scripts/ensure-admin-user.js
 *   node scripts/ensure-admin-user.js --email=abbasskaiki@gmail.com --password=12345678
 *   node scripts/ensure-admin-user.js --from-email=abbaskaiki@gmail.com --email=abbasskaiki@gmail.com
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const bcrypt = require('bcrypt');
const { connectToMongo, disconnectMongo } = require('../config/mongo');
const User = require('../models/user.model');

const args = parseArgs(process.argv.slice(2));
const dryRun = Boolean(args['dry-run'] || args.dryRun);
const targetEmail = normalizeEmail(args.email || process.env.ADMIN_EMAIL || 'abbasskaiki@gmail.com');
const sourceEmail = normalizeEmail(args['from-email'] || args.fromEmail);
const password = args.password || args.p || process.env.ADMIN_PASSWORD || '12345678';

async function main() {
  console.log('Ensuring admin user');
  console.log(`Mode: ${dryRun ? 'dry-run' : 'live'}`);
  console.log(`Target email: ${targetEmail}`);
  if (sourceEmail) {
    console.log(`Source email: ${sourceEmail}`);
  }

  await connectToMongo();

  try {
    let user =
      (sourceEmail ? await User.findOne({ email: sourceEmail }) : null) ||
      (await User.findOne({ email: targetEmail })) ||
      (await User.findOne({ role: 'admin' }));

    if (!user) {
      console.error('No admin candidate found. Run migrate-supabase-to-mongo first or create a user manually.');
      process.exit(1);
    }

    const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10);
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const updates = {
      email: targetEmail,
      role: 'admin',
      status: 'active',
      emailVerified: true,
      passwordHash
    };

    console.log(`Updating user ${user._id} (${user.email})`);

    if (dryRun) {
      console.log('Dry run only; no changes were written');
      return;
    }

    const emailConflict = await User.findOne({
      email: targetEmail,
      _id: { $ne: user._id }
    }).select('_id email').lean();

    if (emailConflict) {
      console.error(`Cannot set admin email to ${targetEmail}; already used by ${emailConflict._id}`);
      process.exit(1);
    }

    user.email = updates.email;
    user.role = updates.role;
    user.status = updates.status;
    user.emailVerified = updates.emailVerified;
    user.passwordHash = updates.passwordHash;
    user.emailVerificationToken = undefined;
    user.emailVerificationTokenExpires = undefined;
    user.refreshTokens = [];

    await user.save();

    console.log('Admin user ready');
    console.log(JSON.stringify({
      id: user._id,
      email: user.email,
      role: user.role,
      status: user.status,
      emailVerified: user.emailVerified
    }, null, 2));
  } finally {
    await disconnectMongo();
  }
}

function normalizeEmail(value) {
  if (!value || typeof value !== 'string') return undefined;
  return value.toLowerCase().trim();
}

function parseArgs(argv) {
  return argv.reduce((acc, entry) => {
    if (!entry.includes('=')) {
      if (entry.startsWith('--')) {
        acc[entry.slice(2)] = true;
      }
      return acc;
    }

    const [key, ...rest] = entry.split('=');
    acc[key.replace(/^--/, '')] = rest.join('=');
    return acc;
  }, {});
}

main().catch((error) => {
  console.error('Ensure admin user failed', error);
  process.exit(1);
});
