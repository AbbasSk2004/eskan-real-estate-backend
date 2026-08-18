const inquiriesService = require('../../services/admin/propertyInquiries.service');

const listInquiries = async (req, res) => {
  try {
    const { searchTerm, status } = req.query;
    const data = await inquiriesService.listInquiries({ searchTerm, status });
    res.json(data);
  } catch (err) {
    console.error('Error listing inquiries', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to fetch inquiries' });
  }
};

const updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const updated = await inquiriesService.updateStatus(id, status);
    res.json(updated);
  } catch (err) {
    console.error('Error updating inquiry status', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to update inquiry status' });
  }
};

const deleteInquiry = async (req, res) => {
  try {
    const { id } = req.params;
    await inquiriesService.deleteInquiry(id);
    res.json({ message: 'Inquiry deleted successfully' });
  } catch (err) {
    console.error('Error deleting inquiry', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to delete inquiry' });
  }
};

const replyInquiry = async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    const inquiry = await inquiriesService.replyInquiry(id, message);
    res.json(inquiry);
  } catch (err) {
    console.error('Error replying to inquiry', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to reply to inquiry' });
  }
};

module.exports = {
  listInquiries,
  updateStatus,
  deleteInquiry,
  replyInquiry
};
