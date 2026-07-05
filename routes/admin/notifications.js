const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../../middleware/auth');
const notificationController = require('../../controllers/notification.controller');

const requireAdmin = requireRole('admin');

// SSE uses token query param because EventSource cannot send Authorization headers.
router.get('/stream', notificationController.authenticateStream, notificationController.streamNotifications);

router.use(requireAuth);
router.use(requireAdmin);

router.get('/', notificationController.getNotifications);
router.get('/unread-count', notificationController.getUnreadCount);
router.get('/unread/count', notificationController.getUnreadCount);
router.get('/stats', notificationController.getStats);
router.get('/type/:type', notificationController.getNotificationsByType);
router.get('/debug-auth', (req, res) => {
  return res.json({
    authenticated: true,
    user: {
      id: req.user._id,
      email: req.user.email,
      role: req.user.role
    }
  });
});

router.put('/read-all', notificationController.markAllAsRead);
router.put('/read/all', notificationController.markAllAsRead);
router.put('/bulk-read', notificationController.bulkMarkAsRead);
router.put('/:id/read', notificationController.markAsRead);

router.delete('/bulk-delete', notificationController.bulkDelete);
router.delete('/all', notificationController.deleteAll);
router.delete('/:id', notificationController.deleteNotification);

router.post('/test', notificationController.testNotification);

module.exports = router;
