const testimonialService = require('../../services/admin/testimonials.service');

const listTestimonials = async (req, res) => {
  try {
    const data = await testimonialService.listTestimonials();
    return res.json(data);
  } catch (err) {
    console.error('Error listing testimonials', err);
    return res.status(500).json({ error: 'Failed to list testimonials' });
  }
};

const setApproval = async (req, res) => {
  try {
    const { id } = req.params;
    const { approved } = req.body;
    const updated = await testimonialService.updateTestimonialApproval(id, Boolean(approved));
    if (!updated) {
      return res.status(404).json({ error: 'Testimonial not found' });
    }
    return res.json(updated);
  } catch (err) {
    console.error('Error updating testimonial approval', err);
    return res.status(500).json({ error: 'Failed to update testimonial approval' });
  }
};

const removeTestimonial = async (req, res) => {
  try {
    const { id } = req.params;
    const success = await testimonialService.deleteTestimonial(id);
    if (!success) {
      return res.status(404).json({ error: 'Testimonial not found' });
    }
    return res.json({ message: 'Testimonial deleted successfully' });
  } catch (err) {
    console.error('Error deleting testimonial', err);
    return res.status(500).json({ error: 'Failed to delete testimonial' });
  }
};

module.exports = {
  listTestimonials,
  setApproval,
  removeTestimonial
};
