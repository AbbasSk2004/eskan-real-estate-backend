const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const notificationController = require('../controllers/notification.controller');

// All notification endpoints require auth
router.use(requireAuth);

router.get('/', notificationController.getNotifications);
router.get('/unread-count', notificationController.getUnreadCount);
router.get('/stats', notificationController.getStats);
router.get('/type/:type', notificationController.getNotificationsByType);

router.put('/read-all', notificationController.markAllAsRead);
router.put('/bulk-read', notificationController.bulkMarkAsRead);
router.put('/:id/read', notificationController.markAsRead);

router.delete('/bulk-delete', notificationController.bulkDelete);
router.delete('/:id', notificationController.deleteNotification);

router.post('/test', notificationController.testNotification);

module.exports = router;
