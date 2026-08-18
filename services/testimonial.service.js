const Testimonial = require('../models/testimonial.model');
const { triggerRevalidation } = require('../utils/revalidateFrontend');

const normalizeTestimonial = (testimonialDoc) => {
  const testimonial = testimonialDoc.toObject ? testimonialDoc.toObject({ virtuals: true }) : testimonialDoc;
  const user = testimonial.userId || null;

  const profilePhoto =
    user?.profilePhoto?.url ||
    user?.profile_photo ||
    null;

  return {
    ...testimonial,
    id: testimonial._id || testimonial.id,
    profiles_id: user?._id || null,
    profiles: {
      profiles_id: user?._id || null,
      firstname: user?.firstName || user?.firstname || '',
      lastname: user?.lastName || user?.lastname || '',
      profile_photo: profilePhoto,
      email: user?.email || null
    }
  };
};

const getApprovedTestimonials = async (limit = 6) => {
  const testimonials = await Testimonial.find({ approved: true })
    .sort({ createdAt: -1 })
    .limit(Number(limit))
    .populate('userId', 'firstName lastName profilePhoto email');

  return testimonials.map(normalizeTestimonial);
};

/**
 * Check whether a user has already submitted a testimonial.
 * @param {string} userId
 * @returns {Promise<{exists: boolean}>}
 */
const checkUserTestimonial = async (userId) => {
  const existing = await Testimonial.findOne({ userId });
  return { exists: !!existing };
};

/**
 * Create a new testimonial for a user.
 * The unique index on userId will prevent duplicates at the DB level.
 * @param {string} userId
 * @param {string} content
 * @param {number} rating
 * @returns {Promise<object>}
 */
const createTestimonial = async (userId, content, rating) => {
  const testimonial = new Testimonial({
    userId,
    content,
    rating,
    approved: false // require admin approval
  });

  await testimonial.save();

  // Populate user for normalised response
  await testimonial.populate('userId', 'firstName lastName profilePhoto email');

  // Home carousel + testimonials list are tagged `testimonials` (see lib/api.js).
  triggerRevalidation({ tags: ['testimonials'] });

  return normalizeTestimonial(testimonial);
};

const listAllTestimonials = async () => {
  const testimonials = await Testimonial.find().sort({ createdAt: -1 }).populate('userId', 'firstName lastName profilePhoto email');
  return testimonials.map(normalizeTestimonial);
};

const updateTestimonialApproval = async (id, approved) => {
  const testimonial = await Testimonial.findById(id).populate('userId', 'firstName lastName profilePhoto email');
  if (!testimonial) return null;
  testimonial.approved = approved;
  await testimonial.save();
  triggerRevalidation({ tags: ['testimonials'] });
  return normalizeTestimonial(testimonial);
};

const deleteTestimonial = async (id) => {
  const deleted = await Testimonial.findByIdAndDelete(id);
  if (deleted) triggerRevalidation({ tags: ['testimonials'] });
  return !!deleted;
};

module.exports = {
  getApprovedTestimonials,
  checkUserTestimonial,
  createTestimonial,
  listAllTestimonials,
  updateTestimonialApproval,
  deleteTestimonial
};
