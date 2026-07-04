const Property = require('../../models/property.model');
const User = require('../../models/user.model');
const PropertyInquiry = require('../../models/propertyInquiry.model');
const Contact = require('../../models/contact.model');
const Payment = require('../../models/payment.model');

const DAYS_20 = 20;

const recentProperties = async () => {
  const since = new Date();
  since.setDate(since.getDate() - DAYS_20);

  return Property.find({ verified: true, createdAt: { $gte: since } })
    .sort({ createdAt: -1 })
    .limit(5)
    .select('title status price createdAt');
};

const stats = async () => {
  const [totalProperties, activeUsers, pendingInquiries, pendingContacts] = await Promise.all([
    Property.countDocuments({ verified: true }),
    User.countDocuments({ status: 'active' }),
    PropertyInquiry.countDocuments({ status: 'pending' }),
    Contact.countDocuments({ status: 'in_progress' })
  ]);

  const totalPending = pendingInquiries + pendingContacts;
  return { totalProperties, activeUsers, pendingInquiries: totalPending };
};

const recentInquiries = async () => {
  const since = new Date();
  since.setDate(since.getDate() - DAYS_20);

  const inquiries = await PropertyInquiry.find({ createdAt: { $gte: since } })
    .sort({ createdAt: -1 })
    .limit(5)
    .populate('userId', 'firstName lastName email')
    .populate('propertyId', 'title');

  return inquiries.map((inq) => ({
    id: inq._id,
    name: `${inq.userId?.firstName || ''} ${inq.userId?.lastName || ''}`.trim() || 'Unknown',
    email: inq.userId?.email || '',
    property: inq.propertyId?.title || 'Unknown Property',
    property_id: inq.propertyId?._id || null,
    date: inq.createdAt,
    status: inq.status || 'New',
    message: inq.message || '',
    replied: inq.status && inq.status.toLowerCase() !== 'new'
  }));
};

const monthlyEarnings = async () => {
  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const startOfNextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const payments = await Payment.find({
    paymentStatus: 'completed',
    createdAt: { $gte: startOfMonth, $lt: startOfNextMonth }
  }).select('amount');

  return payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
};

const earningsOverview = async () => {
  const now = new Date();
  const months = [];
  const earnings = [];

  for (let i = 5; i >= 0; i -= 1) {
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 1));

    const payments = await Payment.find({
      paymentStatus: 'completed',
      createdAt: { $gte: monthStart, $lt: nextMonthStart }
    }).select('amount');

    const monthlyTotal = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    months.push(monthStart.toLocaleString('default', { month: 'short' }));
    earnings.push(monthlyTotal);
  }

  return { months, earnings };
};

module.exports = {
  recentProperties,
  stats,
  recentInquiries,
  monthlyEarnings,
  earningsOverview
};
