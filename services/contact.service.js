const Contact = require('../models/contact.model');

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

  return contact.toObject ? contact.toObject({ virtuals: true }) : contact;
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
  return contacts.map((c) => (c.toObject ? c.toObject({ virtuals: true }) : c));
};

const getContactById = async (id) => {
  const contact = await Contact.findById(id);
  return contact ? (contact.toObject ? contact.toObject({ virtuals: true }) : contact) : null;
};

const updateContactStatus = async (id, status) => {
  const updated = await Contact.findByIdAndUpdate(
    id,
    { status: String(status).trim() },
    { new: true }
  );
  return updated ? (updated.toObject ? updated.toObject({ virtuals: true }) : updated) : null;
};

module.exports = {
  createContact,
  listContacts,
  getContactById,
  updateContactStatus
};
