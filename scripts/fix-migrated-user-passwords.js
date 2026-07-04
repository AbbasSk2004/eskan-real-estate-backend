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

    console.log(`Found ${usersToFix.length} user(s) without a passwordHash`);

    if (!usersToFix.length) {
      console.log('No password repair needed');
      return;
    }

    if (dryRun) {
      console.log('Dry run only; no passwords were changed');
      return;
    }

    const passwordHash = await bcrypt.hash(password, parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10));

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
        }
      }
    );

    console.log(`Updated ${result.modifiedCount} user(s)`);
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
