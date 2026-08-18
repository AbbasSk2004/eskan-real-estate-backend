const Faq = require('../models/faq.model');

const normalizeFaq = (faqDoc) => {
  const faq = faqDoc.toObject ? faqDoc.toObject({ virtuals: true }) : faqDoc;

  return {
    ...faq,
    id: faq._id || faq.id,
    // Keep backward-compatible properties for existing clients
    question: faq.question,
    answer: faq.answer,
    category: faq.category,
    is_featured: faq.isFeatured ?? faq.is_featured,
    order_number: faq.order ?? faq.order_number
  };
};

const getAllFaqs = async () => {
  const faqs = await Faq.find()
    .sort({ order: 1, createdAt: -1 });
  return faqs.map(normalizeFaq);
};

const getFeaturedFaqs = async () => {
  const faqs = await Faq.find({ isFeatured: true })
    .sort({ order: 1, createdAt: -1 });
  return faqs.map(normalizeFaq);
};

const getFaqsByCategory = async (category) => {
  const faqs = await Faq.find({ category })
    .sort({ order: 1, createdAt: -1 });
  return faqs.map(normalizeFaq);
};

const getCategories = async () => {
  const categories = await Faq.distinct('category');
  return categories.filter(Boolean).sort((a, b) => a.localeCompare(b));
};

const createFaq = async (payload) => {
  const highestOrder = await Faq.findOne().sort({ order: -1 }).select('order');
  const nextOrder = (highestOrder?.order ?? 0) + 1;
  const faq = new Faq({
    ...payload,
    order: payload.order ?? nextOrder
  });
  await faq.save();
  return normalizeFaq(faq);
};

const updateFaq = async (id, payload) => {
  const faq = await Faq.findByIdAndUpdate(id, payload, { new: true });
  return faq ? normalizeFaq(faq) : null;
};

const deleteFaq = async (id) => {
  const faq = await Faq.findByIdAndDelete(id);
  return !!faq;
};

module.exports = {
  getAllFaqs,
  getFeaturedFaqs,
  getFaqsByCategory,
  getCategories,
  createFaq,
  updateFaq,
  deleteFaq
};
