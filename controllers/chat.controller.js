const chatService = require('../services/chat.service');

const getConversations = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'unauthorized', message: 'Authentication required' });
    }

    const data = await chatService.getConversations(userId);
    return res.json({ success: true, data });
  } catch (err) {
    console.error('Get conversations error:', err);
    return res.status(500).json({ success: false, error: err.code || 'server_error', message: err.message });
  }
};

const createConversation = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'unauthorized', message: 'Authentication required' });
    }

    const participantId = req.body.participant_id || req.body.participantId;
    const propertyId = req.body.property_id || req.body.propertyId;

    const data = await chatService.createConversation({ userId, participantId, propertyId });
    return res.json({ success: true, data });
  } catch (err) {
    console.error('Create conversation error:', err);
    const status = err.code === 'MISSING_PARTICIPANT' || err.code === 'INVALID_PARTICIPANT' ? 400 : 500;
    return res.status(status).json({ success: false, error: err.code || 'server_error', message: err.message });
  }
};

const getMessages = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'unauthorized', message: 'Authentication required' });
    }

    const conversationId = req.params.conversationId;
    const data = await chatService.getMessages(userId, conversationId);
    return res.json({ success: true, data });
  } catch (err) {
    console.error('Get messages error:', err);
    const status = err.code === 'CONVERSATION_NOT_FOUND' ? 404 : err.code === 'FORBIDDEN' ? 403 : 500;
    return res.status(status).json({ success: false, error: err.code || 'server_error', message: err.message });
  }
};

const sendMessage = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'unauthorized', message: 'Authentication required' });
    }

    const { conversationId, content } = req.body;
    const data = await chatService.sendMessage({ userId, conversationId, content });
    return res.json({ success: true, data });
  } catch (err) {
    console.error('Send message error:', err);
    const status = err.code === 'CONVERSATION_NOT_FOUND' ? 404 : err.code === 'FORBIDDEN' ? 403 : 400;
    return res.status(status).json({ success: false, error: err.code || 'server_error', message: err.message });
  }
};

const markAsRead = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'unauthorized', message: 'Authentication required' });
    }

    const conversationId = req.params.conversationId;
    await chatService.markMessagesAsRead(userId, conversationId);
    return res.json({ success: true });
  } catch (err) {
    console.error('Mark as read error:', err);
    const status = err.code === 'CONVERSATION_NOT_FOUND' ? 404 : err.code === 'FORBIDDEN' ? 403 : 500;
    return res.status(status).json({ success: false, error: err.code || 'server_error', message: err.message });
  }
};

const deleteConversation = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'unauthorized', message: 'Authentication required' });
    }

    const conversationId = req.params.conversationId;
    await chatService.deleteConversation(userId, conversationId);
    return res.json({ success: true });
  } catch (err) {
    console.error('Delete conversation error:', err);
    const status = err.code === 'CONVERSATION_NOT_FOUND' ? 404 : err.code === 'FORBIDDEN' ? 403 : 500;
    return res.status(status).json({ success: false, error: err.code || 'server_error', message: err.message });
  }
};

const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'unauthorized', message: 'Authentication required' });
    }

    const count = await chatService.getUnreadCount(userId);
    return res.json({ success: true, count });
  } catch (err) {
    console.error('Get unread count error:', err);
    return res.status(500).json({ success: false, error: err.code || 'server_error', message: err.message });
  }
};

module.exports = {
  getConversations,
  createConversation,
  getMessages,
  sendMessage,
  markAsRead,
  deleteConversation,
  getUnreadCount
};
