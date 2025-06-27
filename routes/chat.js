const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Get all conversations for a user
router.get('/conversations', async (req, res) => {
  try {
    const profiles_id = req.user.id;
    const { data, error } = await supabase
      .from('conversations')
      .select(`
        *,
        participant1:participant1_id (id, firstname, lastname, profile_photo),
        participant2:participant2_id (id, firstname, lastname, profile_photo),
        property:property_id (id, title, main_image),
        messages (
          id,
          content,
          created_at,
          sender_id,
          read
        )
      `)
      .or(`participant1_id.eq.${profiles_id},participant2_id.eq.${profiles_id}`)
      .order('updated_at', { ascending: false });

    if (error) {
      logger.error('Error fetching conversations:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({ success: true, data });
  } catch (err) {
    logger.error('Error in /conversations:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get messages for a conversation
router.get('/messages/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const profiles_id = req.user.id;

    // Verify user is part of the conversation
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .or(`participant1_id.eq.${profiles_id},participant2_id.eq.${profiles_id}`)
      .single();

    if (convError || !conversation) {
      return res.status(403).json({ success: false, error: 'Not authorized to access this conversation' });
    }

    // Get messages with sender information
    const { data, error } = await supabase
      .from('messages')
      .select(`
        *,
        sender:sender_id (profiles_id, firstname, lastname, profile_photo)
      `)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) {
      logger.error('Error fetching messages:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    // Mark unread messages as read
    if (data && data.length > 0) {
      const unreadMessages = data.filter(msg => !msg.read && msg.sender_id !== profiles_id);
      if (unreadMessages.length > 0) {
        await supabase
          .from('messages')
          .update({ read: true })
          .eq('conversation_id', conversationId)
          .neq('sender_id', profiles_id)
          .eq('read', false);
      }
    }

    // Add cache headers
    res.set('Cache-Control', 'private, max-age=0, no-cache');
    res.json({ success: true, data });
  } catch (err) {
    logger.error('Error in /messages/:conversationId:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create a new conversation
router.post('/conversations', async (req, res) => {
  try {
    const { participant_id, property_id } = req.body;
    const profiles_id = req.user.id;

    // Validate required fields
    if (!participant_id) {
      return res.status(400).json({
        success: false,
        error: 'validation_error',
        message: 'Participant ID is required'
      });
    }

    // Check if participants are different
    if (participant_id === profiles_id) {
      return res.status(400).json({
        success: false,
        error: 'validation_error',
        message: 'Cannot create conversation with yourself'
      });
    }

    // First check if both participants exist in profiles table
    const { data: participants, error: participantsError } = await supabase
      .from('profiles')
      .select('profiles_id, firstname, lastname, profile_photo')
      .in('profiles_id', [profiles_id, participant_id]);

    if (participantsError) {
      logger.error('Error checking participants:', participantsError);
      return res.status(500).json({
        success: false,
        error: participantsError.message,
        message: 'Error checking participants'
      });
    }

    if (!participants || participants.length !== 2) {
      return res.status(404).json({
        success: false,
        error: 'not_found',
        message: 'One or both participants do not exist'
      });
    }

    // Check if property exists if property_id is provided
    if (property_id) {
      const { data: property, error: propertyError } = await supabase
        .from('properties')
        .select('id')
        .eq('id', property_id)
        .single();

      if (propertyError || !property) {
        return res.status(404).json({
          success: false,
          error: 'not_found',
          message: 'Property not found'
        });
      }
    }

    // Check if conversation already exists
    const { data: existingConv, error: checkError } = await supabase
      .from('conversations')
      .select(`
        *,
        participant1:participant1_id (profiles_id, firstname, lastname, profile_photo),
        participant2:participant2_id (profiles_id, firstname, lastname, profile_photo)
      `)
      .or(`and(participant1_id.eq.${profiles_id},participant2_id.eq.${participant_id}),and(participant1_id.eq.${participant_id},participant2_id.eq.${profiles_id})`)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      logger.error('Error checking existing conversation:', checkError);
      return res.status(500).json({
        success: false,
        error: checkError.message,
        message: 'Error checking existing conversation'
      });
    }

    if (existingConv) {
      // Update property_id if it's provided and different
      if (property_id && existingConv.property_id !== property_id) {
        const { error: updateError } = await supabase
          .from('conversations')
          .update({ property_id })
          .eq('id', existingConv.id);

        if (updateError) {
          logger.error('Error updating conversation property:', updateError);
        }
      }
      return res.json({ success: true, data: existingConv });
    }

    // Create new conversation
    const { data: newConversation, error: createError } = await supabase
      .from('conversations')
      .insert([{
        participant1_id: profiles_id,
        participant2_id: participant_id,
        property_id: property_id || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select(`
        *,
        participant1:participant1_id (profiles_id, firstname, lastname, profile_photo),
        participant2:participant2_id (profiles_id, firstname, lastname, profile_photo)
      `)
      .single();

    if (createError) {
      logger.error('Error creating conversation:', createError);
      return res.status(500).json({
        success: false,
        error: createError.message,
        message: 'Failed to create conversation'
      });
    }

    if (!newConversation) {
      return res.status(500).json({
        success: false,
        error: 'no_data',
        message: 'Failed to create conversation - no data returned'
      });
    }

    res.status(201).json({ success: true, data: newConversation });

    // Notify participants via WebSocket (non-blocking)
    try {
      const { sendToUser } = require('../websocket');
      // Send to recipient if not sender
      if (newConversation.participant1_id !== profiles_id) {
        sendToUser(newConversation.participant1_id, 'new_conversation', newConversation);
      }
      if (newConversation.participant2_id !== profiles_id) {
        sendToUser(newConversation.participant2_id, 'new_conversation', newConversation);
      }
    } catch (wsErr) {
      logger.warn('WebSocket notify failed:', wsErr.message);
    }
  } catch (err) {
    logger.error('Error in POST /conversations:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'An unexpected error occurred',
      message: 'Failed to create conversation'
    });
  }
});

// Send a message
router.post('/messages', async (req, res) => {
  try {
    const { conversationId, content } = req.body;
    const profiles_id = req.user.id;

    // Verify user is part of the conversation
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .or(`participant1_id.eq.${profiles_id},participant2_id.eq.${profiles_id}`)
      .single();

    if (convError || !conversation) {
      return res.status(403).json({ success: false, error: 'Not authorized to send messages in this conversation' });
    }

    // Create message
    const { data, error } = await supabase
      .from('messages')
      .insert([{
        conversation_id: conversationId,
        sender_id: profiles_id,
        content,
        read: false
      }])
      .select(`
        *,
        sender:sender_id (id, firstname, lastname, profile_photo)
      `)
      .single();

    if (error) {
      logger.error('Error sending message:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    // Update conversation's updated_at timestamp
    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId);

    res.status(201).json({ success: true, data });

    // Notify participants via WebSocket (non-blocking)
    try {
      const { sendToUser } = require('../websocket');
      // Send to recipient if not sender
      if (conversation.participant1_id !== profiles_id) {
        sendToUser(conversation.participant1_id, 'new_message', data);
      }
      if (conversation.participant2_id !== profiles_id) {
        sendToUser(conversation.participant2_id, 'new_message', data);
      }
    } catch (wsErr) {
      logger.warn('WebSocket notify failed:', wsErr.message);
    }
  } catch (err) {
    logger.error('Error in POST /messages:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Mark messages as read
router.put('/messages/read/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const profiles_id = req.user.id;

    // Verify user is part of the conversation
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .or(`participant1_id.eq.${profiles_id},participant2_id.eq.${profiles_id}`)
      .single();

    if (convError || !conversation) {
      return res.status(403).json({ success: false, error: 'Not authorized to access this conversation' });
    }

    // Mark messages as read
    const { data, error } = await supabase
      .from('messages')
      .update({ read: true })
      .eq('conversation_id', conversationId)
      .neq('sender_id', profiles_id)
      .eq('read', false);

    if (error) {
      logger.error('Error marking messages as read:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({ success: true, data });
  } catch (err) {
    logger.error('Error in PUT /messages/read/:conversationId:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete chat history
router.delete('/conversations/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const profiles_id = req.user.id;

    // Verify user is part of the conversation
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .or(`participant1_id.eq.${profiles_id},participant2_id.eq.${profiles_id}`)
      .single();

    if (convError || !conversation) {
      return res.status(403).json({ success: false, error: 'Not authorized to delete this conversation' });
    }

    // Delete all messages first
    const { error: messagesError } = await supabase
      .from('messages')
      .delete()
      .eq('conversation_id', conversationId);

    if (messagesError) {
      logger.error('Error deleting messages:', messagesError);
      return res.status(500).json({ success: false, error: messagesError.message });
    }

    // Delete the conversation
    const { error: convDeleteError } = await supabase
      .from('conversations')
      .delete()
      .eq('id', conversationId);

    if (convDeleteError) {
      logger.error('Error deleting conversation:', convDeleteError);
      return res.status(500).json({ success: false, error: convDeleteError.message });
    }

    res.json({ success: true });
  } catch (err) {
    logger.error('Error in DELETE /conversations/:conversationId:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Search users
router.get('/users/search', async (req, res) => {
  try {
    const { query, limit = 10 } = req.query;
    const profiles_id = req.user.id;

    if (!query) {
      return res.json({ success: true, data: [] });
    }

    // Search for users by firstname, lastname, or email
    const { data, error } = await supabase
      .from('profiles')
      .select('profiles_id, firstname, lastname, email, profile_photo')
      .neq('profiles_id', profiles_id) // Exclude current user
      .or(`firstname.ilike.%${query}%,lastname.ilike.%${query}%,email.ilike.%${query}%`)
      .limit(limit);

    if (error) {
      logger.error('Error searching users:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({ success: true, data: data || [] });
  } catch (err) {
    logger.error('Error in /users/search:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router; 