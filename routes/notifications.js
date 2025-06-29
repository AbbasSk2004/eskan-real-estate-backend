const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Get all notifications for a user
router.get('/', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'unauthorized',
        message: 'Authentication required'
      });
    }

    const profiles_id = req.user.id;
    logger.debug(`Fetching notifications for user ${profiles_id}`);

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('profiles_id', profiles_id)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Error fetching notifications:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    logger.debug(`Found ${data?.length || 0} notifications for user ${profiles_id}`);

    res.json({
      success: true,
      data: data || []
    });
  } catch (err) {
    logger.error('Error in notifications route:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Get notifications by type
router.get('/type/:type', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'unauthorized',
        message: 'Authentication required'
      });
    }

    const profiles_id = req.user.id;
    const { type } = req.params;

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('profiles_id', profiles_id)
      .eq('type', type)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Error fetching notifications by type:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    res.json({
      success: true,
      data: data || []
    });
  } catch (err) {
    logger.error('Error fetching notifications by type:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Get notification statistics
router.get('/stats', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'unauthorized',
        message: 'Authentication required'
      });
    }

    const profiles_id = req.user.id;
    
    // Get notification statistics using the database function
    const { data, error } = await supabase
      .rpc('get_notification_stats', { user_id: profiles_id });

    if (error) {
      logger.error('Error fetching notification stats:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    res.json({
      success: true,
      data: data || { total: 0, unread: 0, by_type: {} }
    });
  } catch (err) {
    logger.error('Error fetching notification stats:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Get unread notifications count
router.get('/unread-count', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'unauthorized',
        message: 'Authentication required'
      });
    }

    const profiles_id = req.user.id;
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('profiles_id', profiles_id)
      .eq('read', false);

    if (error) {
      logger.error('Error fetching unread count:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    res.json({
      success: true,
      count: count || 0
    });
  } catch (err) {
    logger.error('Error fetching unread count:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Mark notification as read
router.put('/:id/read', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'unauthorized',
        message: 'Authentication required'
      });
    }

    const { id } = req.params;
    const profiles_id = req.user.id;
    const { data, error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', id)
      .eq('profiles_id', profiles_id)
      .select()
      .single();

    if (error) {
      logger.error('Error marking notification as read:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    res.json({
      success: true,
      data
    });
  } catch (err) {
    logger.error('Error marking notification as read:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Mark all notifications as read
router.put('/read-all', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'unauthorized',
        message: 'Authentication required'
      });
    }

    const profiles_id = req.user.id;
    const { data, error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('profiles_id', profiles_id)
      .eq('read', false)
      .select();

    if (error) {
      logger.error('Error marking all notifications as read:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    res.json({
      success: true,
      data: data || []
    });
  } catch (err) {
    logger.error('Error marking all notifications as read:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Bulk mark notifications as read
router.put('/bulk-read', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'unauthorized',
        message: 'Authentication required'
      });
    }

    const profiles_id = req.user.id;
    const { notification_ids } = req.body;

    if (!notification_ids || !Array.isArray(notification_ids)) {
      return res.status(400).json({
        success: false,
        error: 'notification_ids array is required'
      });
    }

    const { data, error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('profiles_id', profiles_id)
      .in('id', notification_ids)
      .select();

    if (error) {
      logger.error('Error bulk marking notifications as read:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    res.json({
      success: true,
      data: data || []
    });
  } catch (err) {
    logger.error('Error bulk marking notifications as read:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Bulk delete notifications
router.delete('/bulk-delete', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'unauthorized',
        message: 'Authentication required'
      });
    }

    const profiles_id = req.user.id;
    const { notification_ids } = req.body;

    if (!notification_ids || !Array.isArray(notification_ids)) {
      return res.status(400).json({
        success: false,
        error: 'notification_ids array is required'
      });
    }

    const { data, error } = await supabase
      .from('notifications')
      .delete()
      .eq('profiles_id', profiles_id)
      .in('id', notification_ids)
      .select();

    if (error) {
      logger.error('Error bulk deleting notifications:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    res.json({
      success: true,
      data: data || []
    });
  } catch (err) {
    logger.error('Error bulk deleting notifications:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

module.exports = router; 