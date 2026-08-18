const testimonialService = require('../../services/testimonial.service');

const listTestimonials = async () => testimonialService.listAllTestimonials();
const updateTestimonialApproval = async (id, approved) => testimonialService.updateTestimonialApproval(id, approved);
const deleteTestimonial = async (id) => testimonialService.deleteTestimonial(id);

module.exports = {
  listTestimonials,
  updateTestimonialApproval,
  deleteTestimonial
};
