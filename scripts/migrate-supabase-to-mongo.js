#!/usr/bin/env node
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { Pool } = require('pg');
const { connectToMongo, disconnectMongo } = require('../config/mongo');
const { normalizePasswordHash } = require('../services/auth.service');

const User = require('../models/user.model');
const Property = require('../models/property.model');
const Agent = require('../models/agent.model');
const Blog = require('../models/blog.model');
const ContactSubmission = require('../models/contactSubmission.model');
const Favorite = require('../models/favorite.model');
const PropertyInquiry = require('../models/propertyInquiry.model');
const Testimonial = require('../models/testimonial.model');
const Payment = require('../models/payment.model');
const Notification = require('../models/notification.model');
const PropertyView = require('../models/propertyView.model');
const Conversation = require('../models/conversation.model');
const Message = require('../models/message.model');

const args = parseArgs(process.argv.slice(2));
const dryRun = Boolean(args['dry-run'] || args.dryRun);
const only = (args.only || '').split(',').map((value) => value.trim()).filter(Boolean);
const batchSize = Number(args['batch-size'] || process.env.BATCH_SIZE || 1000);

const postgresUrl = process.env.POSTGRES_URL;

if (!postgresUrl) {
  console.error('POSTGRES_URL is required');
  process.exit(1);
}

const pool = new Pool({
  connectionString: postgresUrl,
  ssl: { rejectUnauthorized: false }
});

const migrations = [
  { key: 'users', table: 'profiles', handler: migrateUsers },
  { key: 'properties', table: 'properties', handler: migrateProperties },
  { key: 'agents', table: 'agents', handler: migrateAgents },
  { key: 'blogs', table: 'blogs', handler: migrateBlogs },
  { key: 'contact-submissions', table: 'contact_submissions', handler: migrateContactSubmissions },
  { key: 'favorites', table: 'favorites', handler: migrateFavorites },
  { key: 'property-inquiries', table: 'property_inquiries', handler: migratePropertyInquiries },
  { key: 'testimonials', table: 'testimonials', handler: migrateTestimonials },
  { key: 'payments', table: 'payments', handler: migratePayments },
  { key: 'notifications', table: 'notifications', handler: migrateNotifications },
  { key: 'property-views', table: 'property_views', handler: migratePropertyViews },
  { key: 'conversations', table: 'conversations', handler: migrateConversations },
  { key: 'messages', table: 'messages', handler: migrateMessages }
];

async function main() {
  console.log('Starting Supabase to Mongo migration');
  console.log(`Mode: ${dryRun ? 'dry-run' : 'live'}`);

  await connectToMongo();

  const client = await pool.connect();
  try {
    const authUsersById = await fetchAuthUsers(client);

    for (const migration of migrations) {
      if (only.length > 0 && !only.includes(migration.key)) {
        continue;
      }

      const tableExists = await hasTable(client, migration.table);
      if (!tableExists) {
        console.log(`Skipping ${migration.key}: table public.${migration.table} not found`);
        continue;
      }

      const rows = await fetchRows(client, migration.table);
      console.log(`Migrating ${rows.length} rows from public.${migration.table} -> ${migration.key}`);

      if (dryRun) {
        console.log(`Dry run only for ${migration.key}; no documents were written`);
        continue;
      }

      await migration.handler(rows, authUsersById);
      console.log(`Completed ${migration.key}`);
    }
  } finally {
    client.release();
    await disconnectMongo();
    await pool.end();
  }
}

async function hasTable(client, tableName) {
  const res = await client.query('SELECT to_regclass($1) AS table_name', [`public.${tableName}`]);
  return Boolean(res.rows[0]?.table_name);
}

async function fetchRows(client, tableName) {
  const res = await client.query(`SELECT * FROM public.${tableName} ORDER BY id`);
  return res.rows;
}

async function fetchAuthUsers(client) {
  try {
    const tableExists = await hasTableInSchema(client, 'users', 'auth');
    if (!tableExists) {
      console.log('auth.users table not found; continuing without auth email fallback');
      return {};
    }

    const res = await client.query(`
      SELECT id, email, email_confirmed_at, encrypted_password
      FROM auth.users
    `);

    return res.rows.reduce((acc, row) => {
      if (row?.id) {
        acc[String(row.id)] = row;
      }
      return acc;
    }, {});
  } catch (error) {
    console.warn('Unable to read auth.users for email fallback:', error.message);
    return {};
  }
}

async function hasTableInSchema(client, tableName, schemaName = 'public') {
  const res = await client.query('SELECT to_regclass($1) AS table_name', [`${schemaName}.${tableName}`]);
  return Boolean(res.rows[0]?.table_name);
}

async function migrateUsers(rows, authUsersById = {}) {
  for (const row of rows) {
    const id = row.profiles_id || row.user_id;
    if (!id) continue;

    const authUser = authUsersById[String(id)] || null;
    const resolvedEmail = normalizeEmail(row.email, row.user_email, authUser?.email);

    const doc = {
      _id: String(id),
      email: resolvedEmail || `${id}@migrated.local`,
      firstName: getString(row.firstname, row.first_name, row.firstName),
      lastName: getString(row.lastname, row.last_name, row.lastName),
      phone: getString(row.phone, row.phone_number, row.phoneNumber),
      role: normalizeRole(getString(row.role, row.user_role)),
      status: normalizeStatus(getString(row.status)),
      emailVerified: Boolean(
        getBoolean(
          row.email_verified,
          row.emailVerified,
          authUser?.email_confirmed_at ? true : undefined,
          true
        )
      ),
      profilePhoto: normalizePhoto(getString(row.profile_photo, row.profilePhoto)),
      lastLoginAt: toDate(row.last_login, row.last_login_at)
    };

    const update = { $set: doc, $setOnInsert: { createdAt: new Date() } };
    if (authUser?.encrypted_password) {
      update.$set.passwordHash = normalizePasswordHash(authUser.encrypted_password);
    }

    await User.findOneAndUpdate(
      { _id: doc._id },
      update,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
}

async function migrateProperties(rows) {
  for (const row of rows) {
    const id = row.id || row.property_id;
    const ownerId = row.profiles_id || row.user_id || row.owner_id || row.ownerId;
    if (!id || !ownerId) continue;

    const doc = {
      _id: String(id),
      title: getString(row.title) || 'Untitled property',
      description: getString(row.description, row.desc) || '',
      propertyType: getString(row.property_type, row.propertyType, row.type),
      status: getString(row.status) || 'available',
      price: toNumber(row.price),
      bedrooms: toNumber(row.bedrooms),
      bathrooms: toNumber(row.bathrooms),
      area: toNumber(row.area),
      address: getString(row.address),
      city: getString(row.city),
      governorate: getString(row.governorate),
      village: getString(row.village),
      features: normalizeJson(row.features),
      mainImage: normalizeJson(row.main_image, row.mainImage),
      images: normalizeJson(row.images, row.image_urls),
      ownerId: String(ownerId),
      livingRooms: toNumber(row.living_rooms, row.livingRooms),
      floor: toNumber(row.floor),
      yearBuilt: toNumber(row.year_built, row.yearBuilt),
      gardenArea: toNumber(row.garden_area, row.gardenArea),
      parkingSpaces: toNumber(row.parking_spaces, row.parkingSpaces),
      furnishingStatus: getString(row.furnishing_status, row.furnishingStatus),
      shopFrontWidth: toNumber(row.shop_front_width, row.shopFrontWidth),
      storageArea: toNumber(row.storage_area, row.storageArea),
      landType: getString(row.land_type, row.landType),
      zoning: getString(row.zoning),
      meetingRooms: toNumber(row.meeting_rooms, row.meetingRooms),
      officeLayout: getString(row.office_layout, row.officeLayout),
      units: toNumber(row.units),
      elevators: toNumber(row.elevators),
      plotSize: toNumber(row.plot_size, row.plotSize),
      ceilingHeight: toNumber(row.ceiling_height, row.ceilingHeight),
      loadingDocks: toNumber(row.loading_docks, row.loadingDocks),
      farmArea: toNumber(row.farm_area, row.farmArea),
      waterSource: getString(row.water_source, row.waterSource),
      cropTypes: getString(row.crop_types, row.cropTypes),
      view: getString(row.view),
      isFeatured: getBoolean(row.is_featured, row.isFeatured, false),
      verified: getBoolean(row.verified, false),
      recommended: getBoolean(row.recommended, false)
    };

    await Property.findOneAndUpdate(
      { _id: doc._id },
      { $set: doc, $setOnInsert: { createdAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
}

async function migrateAgents(rows) {
  for (const row of rows) {
    const id = row.id || row.agent_id;
    const userId = row.profiles_id || row.user_id || row.userId;
    if (!id || !userId) continue;

    const doc = {
      _id: String(id),
      userId: String(userId),
      specialty: getString(row.specialty) || 'General',
      experience: getString(row.experience) || 'N/A',
      aboutMe: getString(row.about_me, row.aboutMe) || '',
      cvUrl: getString(row.cv_url, row.cvUrl),
      cvPublicId: getString(row.cv_public_id, row.cvPublicId),
      social: normalizeSocial(row.social),
      phone: getString(row.phone),
      languages: normalizeStringArray(row.languages),
      status: normalizeAgentStatus(getString(row.status)),
      approved: getBoolean(row.approved, false),
      approvedAt: toDate(row.approved_at, row.approvedAt),
      image: normalizePhoto(getString(row.image_url, row.image, row.profile_image)),
      isFeatured: getBoolean(row.is_featured, row.isFeatured, false)
    };

    await Agent.findOneAndUpdate(
      { _id: doc._id },
      { $set: doc, $setOnInsert: { createdAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
}

async function migrateBlogs(rows) {
  for (const row of rows) {
    const id = row.id || row.blog_id;
    if (!id) continue;

    const doc = {
      _id: String(id),
      title: getString(row.title) || 'Untitled blog',
      slug: getString(row.slug) || slugify(getString(row.title) || String(id)),
      content: getString(row.content, row.body) || '',
      image: normalizePhoto(getString(row.image_url, row.image)),
      excerpt: getString(row.excerpt, row.summary),
      category: getString(row.category),
      tags: normalizeStringArray(row.tags),
      status: getString(row.status) || 'published'
    };

    await Blog.findOneAndUpdate(
      { _id: doc._id },
      { $set: doc, $setOnInsert: { createdAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
}

async function migrateContactSubmissions(rows) {
  for (const row of rows) {
    const id = row.id || row.contact_id;
    if (!id) continue;

    const doc = {
      _id: String(id),
      name: getString(row.name) || 'Unknown',
      email: normalizeEmail(row.email),
      phone: getString(row.phone),
      message: getString(row.message, row.body) || '',
      preferredContact: getString(row.preferred_contact, row.preferredContact),
      status: getString(row.status) || 'pending'
    };

    await ContactSubmission.findOneAndUpdate(
      { _id: doc._id },
      { $set: doc, $setOnInsert: { createdAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
}

async function migrateFavorites(rows) {
  for (const row of rows) {
    const id = row.id || row.favorite_id;
    const userId = row.profiles_id || row.user_id || row.userId;
    const propertyId = row.property_id || row.propertyId;
    if (!id || !userId || !propertyId) continue;

    const doc = {
      _id: String(id),
      userId: String(userId),
      propertyId: String(propertyId)
    };

    await Favorite.findOneAndUpdate(
      { _id: doc._id },
      { $set: doc },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
}

async function migratePropertyInquiries(rows) {
  for (const row of rows) {
    const id = row.id || row.inquiry_id;
    const propertyId = row.property_id || row.propertyId;
    const userId = row.profiles_id || row.user_id || row.userId;
    if (!id || !propertyId || !userId) continue;

    const doc = {
      _id: String(id),
      propertyId: String(propertyId),
      userId: String(userId),
      message: getString(row.message, row.body) || '',
      status: getString(row.status) || 'pending',
      subject: getString(row.subject)
    };

    await PropertyInquiry.findOneAndUpdate(
      { _id: doc._id },
      { $set: doc, $setOnInsert: { createdAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
}

async function migrateTestimonials(rows) {
  for (const row of rows) {
    const id = row.id || row.testimonial_id;
    const userId = row.profiles_id || row.user_id || row.userId;
    if (!id || !userId) continue;

    const doc = {
      _id: String(id),
      userId: String(userId),
      content: getString(row.content, row.message) || '',
      rating: toNumber(row.rating, 5),
      approved: getBoolean(row.approved, false)
    };

    await Testimonial.findOneAndUpdate(
      { _id: doc._id },
      { $set: doc, $setOnInsert: { createdAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
}

async function migratePayments(rows) {
  for (const row of rows) {
    const id = row.id || row.payment_id;
    const userId = row.profiles_id || row.user_id || row.userId;
    const propertyId = row.property_id || row.propertyId;
    if (!id || !userId) continue;

    const doc = {
      _id: String(id),
      userId: String(userId),
      propertyId: propertyId ? String(propertyId) : undefined,
      amount: toNumber(row.amount, 0),
      paymentType: getString(row.payment_type, row.paymentType) || 'unknown',
      paymentStatus: getString(row.payment_status, row.paymentStatus) || 'completed',
      cardLastFour: getString(row.card_last_four, row.cardLastFour),
      transactionId: getString(row.transaction_id, row.transactionId),
      paymentMethod: getString(row.payment_method, row.paymentMethod) || 'unknown',
      billingName: getString(row.billing_name, row.billingName),
      billingEmail: normalizeEmail(row.billing_email, row.billingEmail),
      description: getString(row.description),
      metadata: normalizeJson(row.metadata)
    };

    await Payment.findOneAndUpdate(
      { _id: doc._id },
      { $set: doc, $setOnInsert: { createdAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
}

async function migrateNotifications(rows) {
  for (const row of rows) {
    const id = row.id || row.notification_id;
    const userId = row.profiles_id || row.user_id || row.userId;
    if (!id || !userId) continue;

    const doc = {
      _id: String(id),
      userId: String(userId),
      type: getString(row.type) || 'info',
      title: getString(row.title) || 'Notification',
      message: getString(row.message) || '',
      data: normalizeJson(row.data, row.metadata),
      read: getBoolean(row.read, false)
    };

    await Notification.findOneAndUpdate(
      { _id: doc._id },
      { $set: doc, $setOnInsert: { createdAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
}

async function migratePropertyViews(rows) {
  for (const row of rows) {
    const id = row.id || row.property_view_id;
    const propertyId = row.property_id || row.propertyId;
    const userId = row.profiles_id || row.user_id || row.userId;
    if (!id || !propertyId) continue;

    const doc = {
      _id: String(id),
      propertyId: String(propertyId),
      userId: userId ? String(userId) : undefined,
      ipAddress: getString(row.ip_address, row.ipAddress) || '0.0.0.0',
      viewedAt: toDate(row.viewed_at, row.viewedAt, new Date()),
      viewedDate: toDate(row.viewed_date, row.viewedDate, new Date())
    };

    await PropertyView.findOneAndUpdate(
      { _id: doc._id },
      { $set: doc },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
}

async function migrateConversations(rows) {
  for (const row of rows) {
    const id = row.id || row.conversation_id;
    const participant1Id = row.participant1_id || row.participant1Id || row.sender_id;
    const participant2Id = row.participant2_id || row.participant2Id || row.receiver_id;
    const propertyId = row.property_id || row.propertyId;
    if (!id || !participant1Id || !participant2Id) continue;

    const doc = {
      _id: String(id),
      participant1Id: String(participant1Id),
      participant2Id: String(participant2Id),
      propertyId: propertyId ? String(propertyId) : undefined,
      lastMessage: normalizeLastMessage(row.last_message, row.lastMessage)
    };

    await Conversation.findOneAndUpdate(
      { _id: doc._id },
      { $set: doc, $setOnInsert: { createdAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
}

async function migrateMessages(rows) {
  for (const row of rows) {
    const id = row.id || row.message_id;
    const conversationId = row.conversation_id || row.conversationId;
    const senderId = row.sender_id || row.senderId;
    if (!id || !conversationId || !senderId) continue;

    const doc = {
      _id: String(id),
      conversationId: String(conversationId),
      senderId: String(senderId),
      content: getString(row.content, row.message) || '',
      read: getBoolean(row.read, false),
      messageType: getString(row.message_type, row.messageType) || 'text',
      file: normalizeFile(row.file)
    };

    await Message.findOneAndUpdate(
      { _id: doc._id },
      { $set: doc, $setOnInsert: { createdAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
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

function normalizeEmail(...values) {
  const email = values.find((value) => typeof value === 'string' && value.trim());
  if (!email) return undefined;
  return email.toLowerCase().trim();
}

function normalizeRole(value) {
  const normalized = String(value || 'user').toLowerCase();
  return ['admin', 'agent', 'user'].includes(normalized) ? normalized : 'user';
}

function normalizeStatus(value) {
  const normalized = String(value || 'active').toLowerCase();
  return ['active', 'inactive', 'banned'].includes(normalized) ? normalized : 'active';
}

function normalizeAgentStatus(value) {
  const normalized = String(value || 'pending').toLowerCase();
  return ['pending', 'approved', 'rejected'].includes(normalized) ? normalized : 'pending';
}

function normalizePhoto(value) {
  if (!value) return undefined;
  if (typeof value === 'object') return value;
  return { url: String(value), publicId: null };
}

function normalizeSocial(value) {
  if (!value) return undefined;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return { raw: String(value) };
  }
}

function normalizeJson(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') return undefined;
    if (typeof value === 'object') return value;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return undefined;
      try {
        return JSON.parse(trimmed);
      } catch (error) {
        return trimmed;
      }
    }
  }
  return undefined;
}

function normalizeStringArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [parsed].filter(Boolean);
    } catch (error) {
      return value.split(',').map((entry) => entry.trim()).filter(Boolean);
    }
  }
  return [];
}

function normalizeLastMessage(value, fallback) {
  const candidate = value || fallback;
  if (!candidate) return undefined;
  if (typeof candidate === 'object') return candidate;
  return { content: String(candidate), senderId: undefined, createdAt: new Date(), messageType: 'text' };
}

function normalizeFile(value) {
  if (!value) return undefined;
  if (typeof value === 'object') return value;
  return { url: String(value), publicId: null, mimeType: null };
}

function toNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const num = Number(value);
    return Number.isFinite(num) ? num : undefined;
  }
  return undefined;
}

function toDate(...values) {
  for (const value of values) {
    if (!value) continue;
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return undefined;
}

function getString(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed || undefined;
    }
    return String(value);
  }
  return undefined;
}

function getBoolean(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', 't', '1', 'yes', 'y'].includes(normalized)) return true;
      if (['false', 'f', '0', 'no', 'n'].includes(normalized)) return false;
    }
  }
  return undefined;
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'item';
}

main().catch((error) => {
  console.error('Migration failed', error);
  process.exit(1);
});
