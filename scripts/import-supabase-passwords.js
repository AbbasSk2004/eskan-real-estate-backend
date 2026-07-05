#!/usr/bin/env node
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { Pool } = require('pg');
const { connectToMongo, disconnectMongo } = require('../config/mongo');
const { normalizePasswordHash } = require('../services/auth.service');
const User = require('../models/user.model');

const args = parseArgs(process.argv.slice(2));
const dryRun = Boolean(args['dry-run'] || args.dryRun);
const postgresUrl = process.env.POSTGRES_URL;

if (!postgresUrl) {
  console.error('POSTGRES_URL is required');
  process.exit(1);
}

const pool = new Pool({
  connectionString: postgresUrl,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  console.log('Importing Supabase auth passwords into MongoDB');
  console.log(`Mode: ${dryRun ? 'dry-run' : 'live'}`);

  await connectToMongo();
  const client = await pool.connect();

  try {
    const tableExists = await hasTable(client, 'auth.users');
    if (!tableExists) {
      console.error('auth.users table not found');
      process.exit(1);
    }

    const res = await client.query(`
      SELECT id, email, encrypted_password, email_confirmed_at
      FROM auth.users
      WHERE encrypted_password IS NOT NULL AND encrypted_password <> ''
    `);

    console.log(`Found ${res.rows.length} Supabase user(s) with passwords`);

    let updated = 0;
    let skipped = 0;
    let missing = 0;

    for (const row of res.rows) {
      const userId = String(row.id);
      const mongoUser = await User.findById(userId).select('_id email role').lean();

      if (!mongoUser) {
        missing += 1;
        console.log(`  skip (no Mongo user): ${row.email || userId}`);
        continue;
      }

      if (dryRun) {
        console.log(`  would update: ${mongoUser.email}`);
        updated += 1;
        continue;
      }

      await User.updateOne(
        { _id: userId },
        {
          $set: {
            passwordHash: normalizePasswordHash(row.encrypted_password),
            emailVerified: Boolean(row.email_confirmed_at)
          },
          $unset: {
            emailVerificationToken: '',
            emailVerificationTokenExpires: ''
          }
        }
      );

      updated += 1;
      console.log(`  updated: ${mongoUser.email}`);
    }

    console.log(`Done. Updated: ${updated}, skipped: ${skipped}, missing in Mongo: ${missing}`);
  } finally {
    client.release();
    await disconnectMongo();
    await pool.end();
  }
}

async function hasTable(client, qualifiedName) {
  const res = await client.query('SELECT to_regclass($1) AS table_name', [qualifiedName]);
  return Boolean(res.rows[0]?.table_name);
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
  console.error('Password import failed', error);
  process.exit(1);
});
