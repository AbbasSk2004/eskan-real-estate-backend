const Notification = require('../models/notification.model');

const TYPE_PRIORITY_MAP = {
  message: 'high',
  favorite_added: 'high',
  property_inquiry: 'high',
  testimonial_approved: 'medium',
  agent_application_approved: 'medium',
  agent_application_rejected: 'medium',
  property_approved: 'medium',
  property_rejected: 'medium',
  system: 'low'
};

const getPriority = (type) => {
  if (!type) return 'low';
  return TYPE_PRIORITY_MAP[type] || 'low';
};

const toResponse = (notificationDoc) => {
  const notification = notificationDoc.toObject ? notificationDoc.toObject({ virtuals: true }) : notificationDoc;

  const createdAt = notification.createdAt || notification.created_at;
  const updatedAt = notification.updatedAt || notification.updated_at;

  return {
    ...notification,
    id: notification._id || notification.id,
    created_at: createdAt,
    updated_at: updatedAt,
    priority: notification.priority || getPriority(notification.type)
  };
};

const listNotifications = async ({ userId, type, unreadOnly } = {}) => {
  if (!userId) return [];

  const filter = { userId };
  if (type) filter.type = type;
  if (unreadOnly === true) filter.read = false;

  const notifications = await Notification.find(filter).sort({ createdAt: -1 });
  return notifications.map(toResponse);
};

const getNotification = async (id, userId) => {
  if (!id || !userId) return null;
  const notification = await Notification.findOne({ _id: id, userId });
  return notification ? toResponse(notification) : null;
};

const markAsRead = async (id, userId) => {
  if (!id || !userId) return null;
  const notification = await Notification.findOneAndUpdate(
    { _id: id, userId },
    { read: true },
    { new: true }
  );
  return notification ? toResponse(notification) : null;
};

const markAllAsRead = async (userId) => {
  if (!userId) return { modifiedCount: 0 };
  const result = await Notification.updateMany({ userId, read: false }, { read: true });
  return { modifiedCount: result.modifiedCount || 0 };
};

const bulkMarkAsRead = async (ids = [], userId) => {
  if (!Array.isArray(ids) || !ids.length || !userId) return { modifiedCount: 0 };
  const result = await Notification.updateMany(
    { _id: { $in: ids }, userId },
    { read: true }
  );
  return { modifiedCount: result.modifiedCount || 0 };
};

const getUnreadCount = async (userId) => {
  if (!userId) return 0;
  return Notification.countDocuments({ userId, read: false });
};

const deleteNotification = async (id, userId) => {
  if (!id || !userId) return null;
  const deleted = await Notification.findOneAndDelete({ _id: id, userId });
  return deleted ? toResponse(deleted) : null;
};

const bulkDeleteNotifications = async (ids = [], userId) => {
  if (!Array.isArray(ids) || !ids.length || !userId) return { deletedCount: 0 };
  const result = await Notification.deleteMany({ _id: { $in: ids }, userId });
  return { deletedCount: result.deletedCount || 0 };
};

const getStats = async (userId) => {
  if (!userId) {
    return {
      total: 0,
      unread: 0,
      recent: 0,
      byType: {},
      byPriority: {
        high: 0,
        medium: 0,
        low: 0
      }
    };
  }

  const notifications = await Notification.find({ userId }).sort({ createdAt: -1 });

  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const stats = {
    total: notifications.length,
    unread: notifications.filter(n => !n.read).length,
    recent: notifications.filter(n => (n.createdAt || n.created_at) > twentyFourHoursAgo).length,
    byType: {},
    byPriority: {
      high: 0,
      medium: 0,
      low: 0
    }
  };

  notifications.forEach((n) => {
    const type = n.type || 'unknown';
    stats.byType[type] = (stats.byType[type] || 0) + 1;

    const priority = n.priority || getPriority(type);
    stats.byPriority[priority] = (stats.byPriority[priority] || 0) + 1;
  });

  return stats;
};

const createNotification = async ({ userId, type, title, message, data = {}, read = false }) => {
  const payload = {
    userId,
    type,
    title,
    message,
    data,
    read
  };

  const notification = new Notification(payload);
  await notification.save();
  return toResponse(notification);
};

module.exports = {
  listNotifications,
  getNotification,
  markAsRead,
  markAllAsRead,
  bulkMarkAsRead,
  getUnreadCount,
  deleteNotification,
  bulkDeleteNotifications,
  getStats,
  createNotification
};
