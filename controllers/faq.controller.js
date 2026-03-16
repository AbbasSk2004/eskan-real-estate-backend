const faqService = require('../services/faq.service');

const getAllFaqs = async (req, res) => {
  try {
    const faqs = await faqService.getAllFaqs();
    res.json({ success: true, data: faqs });
  } catch (err) {
    console.error('Error fetching FAQs', err);
    res.status(500).json({ success: false, message: 'Failed to fetch FAQs' });
  }
};

const getFeaturedFaqs = async (req, res) => {
  try {
    const faqs = await faqService.getFeaturedFaqs();
    res.json({ success: true, data: faqs });
  } catch (err) {
    console.error('Error fetching featured FAQs', err);
    res.status(500).json({ success: false, message: 'Failed to fetch featured FAQs' });
  }
};

const getFaqsByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const faqs = await faqService.getFaqsByCategory(category);
    res.json({ success: true, data: faqs });
  } catch (err) {
    console.error('Error fetching FAQs by category', err);
    res.status(500).json({ success: false, message: 'Failed to fetch FAQs by category' });
  }
};

const createFaq = async (req, res) => {
  try {
    const faq = await faqService.createFaq(req.body);
    res.status(201).json({ success: true, data: faq });
  } catch (err) {
    console.error('Error creating FAQ', err);
    res.status(500).json({ success: false, message: 'Failed to create FAQ' });
  }
};

const updateFaq = async (req, res) => {
  try {
    const updated = await faqService.updateFaq(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'FAQ not found' });
    }
    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('Error updating FAQ', err);
    res.status(500).json({ success: false, message: 'Failed to update FAQ' });
  }
};

const deleteFaq = async (req, res) => {
  try {
    const deleted = await faqService.deleteFaq(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'FAQ not found' });
    }
    res.json({ success: true, message: 'FAQ deleted successfully' });
  } catch (err) {
    console.error('Error deleting FAQ', err);
    res.status(500).json({ success: false, message: 'Failed to delete FAQ' });
  }
};

module.exports = {
  getAllFaqs,
  getFeaturedFaqs,
  getFaqsByCategory,
  createFaq,
  updateFaq,
  deleteFaq
};
