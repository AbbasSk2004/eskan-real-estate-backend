const Conversation = require('../models/conversation.model');
const Message = require('../models/message.model');
const User = require('../models/user.model');

const sanitizeUser = (user) => {
  if (!user) return null;
  const obj = user.toObject ? user.toObject() : { ...user };
  const { passwordHash, refreshTokens, __v, ...rest } = obj;

  // Provide consistent snake_case output for frontend
  return {
    id: rest._id || rest.id,
    firstname: rest.firstName,
    lastname: rest.lastName,
    email: rest.email,
    profile_photo: rest.profilePhoto || rest.profile_photo || null,
    role: rest.role,
    status: rest.status,
    emailVerified: rest.emailVerified,
    phone: rest.phone
  };
};

const mapMessage = (message, sender) => {
  return {
    id: message._id,
    conversation_id: message.conversationId,
    sender_id: message.senderId,
    content: message.content,
    read: message.read,
    created_at: message.createdAt ? message.createdAt.toISOString() : message.createdAt,
    updated_at: message.updatedAt ? message.updatedAt.toISOString() : message.updatedAt,
    sender: sender ? sanitizeUser(sender) : null
  };
};

const mapConversation = (conversation, currentUserId, messages = [], participants = {}) => {
  const participant1 = participants[conversation.participant1Id] || null;
  const participant2 = participants[conversation.participant2Id] || null;

  // Determine unread count for current user
  const unreadCount = messages.filter(msg => msg.senderId !== currentUserId && !msg.read).length;

  const lastMessage = conversation.lastMessage || (messages.length ? messages[messages.length - 1] : null);

  return {
    id: conversation._id,
    participant1_id: conversation.participant1Id,
    participant2_id: conversation.participant2Id,
    participant1: participant1 ? sanitizeUser(participant1) : null,
    participant2: participant2 ? sanitizeUser(participant2) : null,
    property_id: conversation.propertyId || null,
    messages: messages.map((msg) => mapMessage(msg, participants[msg.senderId])),
    last_message: lastMessage ? {
      id: lastMessage._id,
      content: lastMessage.content,
      sender_id: lastMessage.senderId,
      created_at: lastMessage.createdAt ? lastMessage.createdAt.toISOString() : lastMessage.createdAt,
      read: lastMessage.read
    } : null,
    unread_count: unreadCount,
    created_at: conversation.createdAt ? conversation.createdAt.toISOString() : conversation.createdAt,
    updated_at: conversation.updatedAt ? conversation.updatedAt.toISOString() : conversation.updatedAt
  };
};

const getConversations = async (userId) => {
  // Get conversations where the user is a participant
  const conversations = await Conversation.find({
    $or: [{ participant1Id: userId }, { participant2Id: userId }]
  }).sort({ updatedAt: -1 });

  if (!conversations.length) return [];

  // Collect all user IDs needed for participants and message senders
  const userIds = new Set();
  conversations.forEach(conv => {
    userIds.add(conv.participant1Id);
    userIds.add(conv.participant2Id);
  });

  // Fetch user info
  const users = await User.find({ _id: { $in: Array.from(userIds) } });
  const usersById = users.reduce((acc, user) => {
    acc[user._id] = user;
    return acc;
  }, {});

  // Fetch last messages for each conversation (limited to 1 per conversation)
  const conversationIds = conversations.map(c => c._id);
  const messages = await Message.find({ conversationId: { $in: conversationIds } })
    .sort({ createdAt: 1 });

  const messagesByConversation = messages.reduce((acc, msg) => {
    acc[msg.conversationId] = acc[msg.conversationId] || [];
    acc[msg.conversationId].push(msg);
    return acc;
  }, {});

  return conversations.map(conv => {
    const msgs = messagesByConversation[conv._id] || [];
    return mapConversation(conv, userId, msgs, usersById);
  });
};

const createConversation = async ({ userId, participantId, propertyId = null }) => {
  if (!participantId) {
    const err = new Error('Participant ID is required');
    err.code = 'MISSING_PARTICIPANT';
    throw err;
  }

  if (participantId === userId) {
    const err = new Error('Cannot create conversation with yourself');
    err.code = 'INVALID_PARTICIPANT';
    throw err;
  }

  // Ensure consistent ordering for the unique index
  const [p1, p2] = [userId, participantId].sort();

  let conversation = await Conversation.findOne({ participant1Id: p1, participant2Id: p2 });
  if (!conversation) {
    conversation = await Conversation.create({
      participant1Id: p1,
      participant2Id: p2,
      propertyId: propertyId || null
    });
  }

  const users = await User.find({ _id: { $in: [p1, p2] } });
  const usersById = users.reduce((acc, user) => {
    acc[user._id] = user;
    return acc;
  }, {});

  return mapConversation(conversation, userId, [], usersById);
};

const getMessages = async (userId, conversationId) => {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    const err = new Error('Conversation not found');
    err.code = 'CONVERSATION_NOT_FOUND';
    throw err;
  }

  if (![conversation.participant1Id, conversation.participant2Id].includes(userId)) {
    const err = new Error('Not a participant in conversation');
    err.code = 'FORBIDDEN';
    throw err;
  }

  const messages = await Message.find({ conversationId }).sort({ createdAt: 1 });
  const userIds = Array.from(new Set(messages.map(m => m.senderId).concat([conversation.participant1Id, conversation.participant2Id])));
  const users = await User.find({ _id: { $in: userIds } });
  const usersById = users.reduce((acc, user) => {
    acc[user._id] = user;
    return acc;
  }, {});

  return messages.map(msg => mapMessage(msg, usersById[msg.senderId]));
};

const sendMessage = async ({ userId, conversationId, content }) => {
  if (!content || typeof content !== 'string' || !content.trim()) {
    const err = new Error('Message content is required');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    const err = new Error('Conversation not found');
    err.code = 'CONVERSATION_NOT_FOUND';
    throw err;
  }

  if (![conversation.participant1Id, conversation.participant2Id].includes(userId)) {
    const err = new Error('Not a participant in conversation');
    err.code = 'FORBIDDEN';
    throw err;
  }

  const message = await Message.create({
    conversationId,
    senderId: userId,
    content: content.trim(),
    read: false
  });

  // Update conversation lastMessage
  conversation.lastMessage = {
    content: message.content,
    senderId: userId,
    createdAt: message.createdAt,
    messageType: message.messageType
  };
  conversation.updatedAt = new Date();
  await conversation.save();

  const sender = await User.findById(userId);
  return mapMessage(message, sender);
};

const markMessagesAsRead = async (userId, conversationId) => {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    const err = new Error('Conversation not found');
    err.code = 'CONVERSATION_NOT_FOUND';
    throw err;
  }

  if (![conversation.participant1Id, conversation.participant2Id].includes(userId)) {
    const err = new Error('Not a participant in conversation');
    err.code = 'FORBIDDEN';
    throw err;
  }

  await Message.updateMany({
    conversationId,
    senderId: { $ne: userId },
    read: false
  }, {
    $set: { read: true }
  });

  return true;
};

const deleteConversation = async (userId, conversationId) => {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) return false;

  if (![conversation.participant1Id, conversation.participant2Id].includes(userId)) {
    const err = new Error('Not a participant in conversation');
    err.code = 'FORBIDDEN';
    throw err;
  }

  await Message.deleteMany({ conversationId });
  await Conversation.deleteOne({ _id: conversationId });
  return true;
};

const getUnreadCount = async (userId) => {
  const conversations = await Conversation.find({
    $or: [{ participant1Id: userId }, { participant2Id: userId }]
  }).select('_id');

  const conversationIds = conversations.map(c => c._id);
  if (!conversationIds.length) return 0;

  const count = await Message.countDocuments({
    conversationId: { $in: conversationIds },
    senderId: { $ne: userId },
    read: false
  });

  return count;
};

module.exports = {
  getConversations,
  createConversation,
  getMessages,
  sendMessage,
  markMessagesAsRead,
  deleteConversation,
  getUnreadCount
};
