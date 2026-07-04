#!/usr/bin/env node
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const bcrypt = require('bcrypt');
const { connectToMongo, disconnectMongo } = require('../config/mongo');
const User = require('../models/user.model');

const args = parseArgs(process.argv.slice(2));
const dryRun = Boolean(args['dry-run'] || args.dryRun);
const password = args.password || args.p || process.env.DEFAULT_MIGRATED_PASSWORD || '12345678';

async function main() {
  console.log('Starting migrated user password repair');
  console.log(`Mode: ${dryRun ? 'dry-run' : 'live'}`);
  console.log(`Password target: ${password}`);

  await connectToMongo();

  try {
    const usersToFix = await User.find({
      $or: [
        { passwordHash: { $exists: false } },
        { passwordHash: null },
        { passwordHash: '' }
      ]
    }).select('_id email role emailVerified').lean();

    const unverifiedWithPassword = await User.find({
      emailVerified: { $ne: true },
      passwordHash: { $exists: true, $nin: [null, ''] }
    }).select('_id email role emailVerified').lean();

    console.log(`Found ${usersToFix.length} user(s) without a passwordHash`);
    console.log(`Found ${unverifiedWithPassword.length} verified-password user(s) with emailVerified=false`);

    if (!usersToFix.length && !unverifiedWithPassword.length) {
      console.log('No password repair needed');
      return;
    }

    if (dryRun) {
      console.log('Dry run only; no passwords were changed');
      return;
    }

    const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10);
    let updatedPasswordCount = 0;
    let verifiedCount = 0;

    if (usersToFix.length) {
      const passwordHash = await bcrypt.hash(password, saltRounds);
      const result = await User.updateMany(
        {
          $or: [
            { passwordHash: { $exists: false } },
            { passwordHash: null },
            { passwordHash: '' }
          ]
        },
        {
          $set: {
            passwordHash,
            emailVerified: true
          },
          $unset: {
            emailVerificationToken: '',
            emailVerificationTokenExpires: ''
          }
        }
      );
      updatedPasswordCount = result.modifiedCount;
    }

    if (unverifiedWithPassword.length) {
      const verifyResult = await User.updateMany(
        {
          emailVerified: { $ne: true },
          passwordHash: { $exists: true, $nin: [null, ''] },
          emailVerificationToken: { $exists: false }
        },
        {
          $set: { emailVerified: true },
          $unset: {
            emailVerificationToken: '',
            emailVerificationTokenExpires: ''
          }
        }
      );
      verifiedCount = verifyResult.modifiedCount;
    }

    console.log(`Updated ${updatedPasswordCount} user(s) with default password`);
    console.log(`Marked ${verifiedCount} migrated user(s) as emailVerified`);
    console.log('Password repair complete');
  } finally {
    await disconnectMongo();
  }
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
    const value = rest.join('=');
    acc[key.replace(/^--/, '')] = value;
    return acc;
  }, {});
}

main().catch((error) => {
  console.error('Password repair failed', error);
  process.exit(1);
});
