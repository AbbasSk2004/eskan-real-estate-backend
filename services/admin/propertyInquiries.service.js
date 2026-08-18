const PropertyInquiry = require('../../models/propertyInquiry.model');
const Property = require('../../models/property.model');
const User = require('../../models/user.model');

const listInquiries = async ({ searchTerm, status }) => {
  const filter = {};
  if (status && status !== 'all') {
    filter.status = status;
  }

  if (searchTerm) {
    const regex = new RegExp(searchTerm, 'i');
    const users = await User.find({
      $or: [
        { firstName: regex },
        { lastName: regex },
        { email: regex }
      ]
    }).select('_id');

    const userIds = users.map((u) => u._id);

    const properties = await Property.find({ title: regex }).select('_id');
    const propertyIds = properties.map((p) => p._id);

    filter.$or = [
      { userId: { $in: userIds } },
      { propertyId: { $in: propertyIds } }
    ];
  }

  const inquiries = await PropertyInquiry.find(filter)
    .sort({ createdAt: -1 })
    .populate('userId', 'firstName lastName email')
    .populate('propertyId', 'title');

  return inquiries.map((inquiry) => ({
    id: inquiry._id,
    name: `${inquiry.userId?.firstName || ''} ${inquiry.userId?.lastName || ''}`.trim() || 'Unknown',
    email: inquiry.userId?.email || '',
    phone: '',
    subject: inquiry.propertyId?.title ? `Interest in ${inquiry.propertyId.title}` : 'Property Inquiry',
    message: inquiry.message || '',
    property: inquiry.propertyId?.title || 'Unknown Property',
    property_id: inquiry.propertyId?._id || null,
    status: inquiry.status || 'New',
    date: inquiry.createdAt,
    replied: inquiry.status && inquiry.status.toLowerCase() !== 'new'
  }));
};

const updateStatus = async (id, status) => {
  if (!status) {
    const err = new Error('Status is required');
    err.status = 400;
    throw err;
  }

  const inquiry = await PropertyInquiry.findByIdAndUpdate(
    id,
    { status },
    { new: true }
  );

  if (!inquiry) {
    const err = new Error('Inquiry not found');
    err.status = 404;
    throw err;
  }

  return inquiry;
};

const deleteInquiry = async (id) => {
  const deleted = await PropertyInquiry.findByIdAndDelete(id);
  if (!deleted) {
    const err = new Error('Inquiry not found');
    err.status = 404;
    throw err;
  }
  return true;
};

const replyInquiry = async (id, message) => {
  const inquiry = await PropertyInquiry.findById(id);
  if (!inquiry) {
    const err = new Error('Inquiry not found');
    err.status = 404;
    throw err;
  }

  inquiry.status = 'In Progress';
  await inquiry.save();

  // Note: actual email logic is not implemented
  return inquiry;
};

module.exports = {
  listInquiries,
  updateStatus,
  deleteInquiry,
  replyInquiry
};
