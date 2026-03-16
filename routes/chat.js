const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const chatController = require('../controllers/chat.controller');

// Conversations
router.get('/conversations', requireAuth, chatController.getConversations);
router.post('/conversations', requireAuth, chatController.createConversation);
router.delete('/conversations/:conversationId', requireAuth, chatController.deleteConversation);

// Messages
router.get('/messages/:conversationId', requireAuth, chatController.getMessages);
router.post('/messages', requireAuth, chatController.sendMessage);
router.put('/messages/read/:conversationId', requireAuth, chatController.markAsRead);
router.get('/messages/unread/count', requireAuth, chatController.getUnreadCount);

module.exports = router;
