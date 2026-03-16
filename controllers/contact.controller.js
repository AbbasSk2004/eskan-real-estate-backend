const contactService = require('../services/contact.service');

const createContact = async (req, res) => {
  try {
    const { name, email, message } = req.body || {};

    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and message are required'
      });
    }

    const created = await contactService.createContact(req.body);

    return res.status(201).json({
      success: true,
      message: 'Contact request submitted successfully',
      data: created
    });
  } catch (err) {
    console.error('Error creating contact record', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit contact request'
    });
  }
};

// Optional admin/testing endpoints
const getAllContacts = async (req, res) => {
  try {
    const contacts = await contactService.listContacts(req.query);
    return res.json({ success: true, data: contacts });
  } catch (err) {
    console.error('Error listing contacts', err);
    return res.status(500).json({ success: false, message: 'Failed to get contacts' });
  }
};

const getContact = async (req, res) => {
  try {
    const contact = await contactService.getContactById(req.params.id);
    if (!contact) {
      return res.status(404).json({ success: false, message: 'Contact not found' });
    }
    return res.json({ success: true, data: contact });
  } catch (err) {
    console.error('Error fetching contact', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch contact' });
  }
};

const updateStatus = async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!status) {
      return res.status(400).json({ success: false, message: 'Status is required' });
    }

    const updated = await contactService.updateContactStatus(req.params.id, status);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Contact not found' });
    }

    return res.json({ success: true, data: updated });
  } catch (err) {
    console.error('Error updating contact status', err);
    return res.status(500).json({ success: false, message: 'Failed to update contact status' });
  }
};

module.exports = {
  createContact,
  getAllContacts,
  getContact,
  updateStatus
};
