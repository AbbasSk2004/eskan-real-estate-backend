const Contact = require('../models/contact.model');
const notificationService = require('./notification.service');

// Normalizes a Contact document into the admin-panel UI contract:
// id / preferred_contact / created_at (kept alongside createdAt for safety).
const toContactJson = (contact) => {
  if (!contact) return null;
  const doc = contact.toObject ? contact.toObject({ virtuals: true }) : contact;
  return {
    id: doc.id || doc._id,
    name: doc.name || '',
    email: doc.email || '',
    phone: doc.phone || '',
    message: doc.message || '',
    preferred_contact: doc.preferredContact || 'email',
    status: doc.status || 'in_progress',
    created_at: doc.createdAt || null,
    createdAt: doc.createdAt || null
  };
};

const normalizeContactPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return {};

  const preferredContact = String(payload.preferredContact || payload.preferred_contact || '').trim().toLowerCase();
  const normalizedPreferredContact = ['email', 'sms', 'whatsapp', 'phone'].includes(preferredContact)
    ? preferredContact
    : 'email';

  return {
    name: payload.name?.trim?.() || '',
    email: payload.email?.toLowerCase?.().trim?.() || '',
    phone: payload.phone?.trim?.() || '',
    message: payload.message?.trim?.() || '',
    preferredContact: normalizedPreferredContact,
    status: payload.status ? String(payload.status).trim() : 'in_progress'
  };
};

const createContact = async (payload) => {
  const normalized = normalizeContactPayload(payload);

  const contact = new Contact(normalized);
  await contact.save();

  notificationService.createAdminNotification({
    type: 'contact',
    title: 'New contact submission',
    message: `${normalized.name || 'Someone'} sent a contact request`,
    data: { contact_id: contact._id }
  });

  return toContactJson(contact);
};

const listContacts = async (filters = {}) => {
  const query = {};

  if (filters.status) {
    query.status = String(filters.status).trim();
  }
  if (filters.email) {
    query.email = String(filters.email).trim().toLowerCase();
  }

  const contacts = await Contact.find(query).sort({ createdAt: -1 });
  return contacts.map(toContactJson);
};

const getContactById = async (id) => {
  const contact = await Contact.findById(id);
  return toContactJson(contact);
};

const updateContactStatus = async (id, status) => {
  const updated = await Contact.findByIdAndUpdate(
    id,
    { status: String(status).trim() },
    { new: true }
  );
  return toContactJson(updated);
};

const deleteContact = async (id) => {
  const deleted = await Contact.findByIdAndDelete(id);
  return !!deleted;
};

module.exports = {
  createContact,
  listContacts,
  getContactById,
  updateContactStatus,
  deleteContact
};
