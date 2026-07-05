const notificationService = require('../services/notification.service');
const authService = require('../services/auth.service');
const User = require('../models/user.model');
const notificationStream = require('../utils/notificationStream');

const getNotifications = async (req, res) => {
  try {
    const userId = req.user?._id;
    const { type, limit, offset } = req.query;

    const notifications = await notificationService.listNotifications({
      userId,
      type,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined
    });

    return res.json({ success: true, data: notifications });
  } catch (err) {
    console.error('Error fetching notifications', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
  }
};

const getNotificationsByType = async (req, res) => {
  try {
    const userId = req.user?._id;
    const { type } = req.params;
    if (!type) {
      return res.status(400).json({ success: false, message: 'Notification type is required' });
    }

    const notifications = await notificationService.listNotifications({ userId, type });
    return res.json({ success: true, data: notifications });
  } catch (err) {
    console.error('Error fetching notifications by type', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch notifications by type' });
  }
};

const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user?._id;
    const count = await notificationService.getUnreadCount(userId);
    return res.json({ success: true, count: Number(count) });
  } catch (err) {
    console.error('Error fetching unread notification count', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch unread notification count' });
  }
};

const getStats = async (req, res) => {
  try {
    const userId = req.user?._id;
    const stats = await notificationService.getStats(userId);
    return res.json({ success: true, data: stats });
  } catch (err) {
    console.error('Error fetching notification stats', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch notification stats' });
  }
};

const markAsRead = async (req, res) => {
  try {
    const userId = req.user?._id;
    const notificationId = req.params.id;
    const notification = await notificationService.markAsRead(notificationId, userId);

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    return res.json({ success: true, data: notification });
  } catch (err) {
    console.error('Error marking notification as read', err);
    return res.status(500).json({ success: false, message: 'Failed to mark notification as read' });
  }
};

const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user?._id;
    const result = await notificationService.markAllAsRead(userId);
    return res.json({ success: true, data: { modifiedCount: result.modifiedCount } });
  } catch (err) {
    console.error('Error marking all notifications as read', err);
    return res.status(500).json({ success: false, message: 'Failed to mark all notifications as read' });
  }
};

const bulkMarkAsRead = async (req, res) => {
  try {
    const userId = req.user?._id;
    const { notification_ids } = req.body || {};
    const result = await notificationService.bulkMarkAsRead(notification_ids, userId);
    return res.json({ success: true, data: { modifiedCount: result.modifiedCount } });
  } catch (err) {
    console.error('Error bulk marking notifications as read', err);
    return res.status(500).json({ success: false, message: 'Failed to bulk mark notifications as read' });
  }
};

const deleteNotification = async (req, res) => {
  try {
    const userId = req.user?._id;
    const notificationId = req.params.id;
    const deleted = await notificationService.deleteNotification(notificationId, userId);

    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    return res.json({ success: true, data: deleted });
  } catch (err) {
    console.error('Error deleting notification', err);
    return res.status(500).json({ success: false, message: 'Failed to delete notification' });
  }
};

const bulkDelete = async (req, res) => {
  try {
    const userId = req.user?._id;
    const { notification_ids } = req.body || {};
    const result = await notificationService.bulkDeleteNotifications(notification_ids, userId);
    return res.json({ success: true, data: { deletedCount: result.deletedCount } });
  } catch (err) {
    console.error('Error bulk deleting notifications', err);
    return res.status(500).json({ success: false, message: 'Failed to bulk delete notifications' });
  }
};

const deleteAll = async (req, res) => {
  try {
    const userId = req.user?._id;
    const result = await notificationService.deleteAllForUser(userId);
    return res.json({ success: true, data: { deletedCount: result.deletedCount } });
  } catch (err) {
    console.error('Error deleting all notifications', err);
    return res.status(500).json({ success: false, message: 'Failed to delete all notifications' });
  }
};

const testNotification = async (req, res) => {
  try {
    const userId = req.user?._id;
    const notification = await notificationService.createNotification({
      userId,
      type: 'system',
      title: 'Test notification',
      message: 'This is a test notification.',
      data: { test: true }
    });
    return res.json({ success: true, data: notification });
  } catch (err) {
    console.error('Error creating test notification', err);
    return res.status(500).json({ success: false, message: 'Failed to create test notification' });
  }
};

const streamNotifications = async (req, res) => {
  const userId = req.user?._id;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

  notificationStream.addClient(userId, res);

  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch (err) {
      clearInterval(heartbeat);
      notificationStream.removeClient(userId, res);
    }
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    notificationStream.removeClient(userId, res);
  });
};

const authenticateStream = async (req, res, next) => {
  try {
    const token = req.query.token;
    if (!token) {
      return res.status(401).json({ success: false, message: 'Token required' });
    }

    const payload = authService.verifyAccessToken(token);
    if (!payload?.sub) {
      return res.status(401).json({ success: false, message: 'Invalid access token' });
    }

    const user = await User.findById(payload.sub);
    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    if (user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Insufficient privileges' });
    }

    req.user = user;
    req.tokenPayload = payload;
    return next();
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  getNotifications,
  getNotificationsByType,
  getUnreadCount,
  getStats,
  markAsRead,
  markAllAsRead,
  bulkMarkAsRead,
  deleteNotification,
  bulkDelete,
  deleteAll,
  testNotification,
  streamNotifications,
  authenticateStream
};
