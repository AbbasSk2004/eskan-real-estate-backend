const { Server } = require('ws');
const url = require('url');
const { createClient } = require('@supabase/supabase-js');
const logger = require('./utils/logger');

// Supabase client for token verification
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// In-module variable so other modules can import sendToUser even before setup runs
let sendToUser = () => {};

function setupWebSocket(server) {
  // Create a WebSocket server that shares the existing HTTP server
  const wss = new Server({ server });

  // Map<userId, Set<ws>>
  const userSockets = new Map();

  /**
   * Authenticate an access-token (JWT) with Supabase.
   * @param {string} token
   * @returns {Promise<string|null>} user id or null if invalid
   */
  const authenticate = async (token) => {
    if (!token) return null;
    try {
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data?.user) return null;
      return data.user.id;
    } catch (err) {
      logger.error('WebSocket auth error:', err);
      return null;
    }
  };

  wss.on('connection', async (ws, req) => {
    const { query } = url.parse(req.url, true);
    const token = query.token;

    const userId = await authenticate(token);
    if (!userId) {
      ws.close(4401, 'Unauthorized'); // 4401: custom code for auth failure
      return;
    }

    // Store socket
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId).add(ws);
    logger.info(`WebSocket connected: ${userId}`);

    ws.on('close', () => {
      const set = userSockets.get(userId);
      if (set) {
        set.delete(ws);
        if (set.size === 0) userSockets.delete(userId);
      }
      logger.info(`WebSocket disconnected: ${userId}`);
    });

    // Optional: listen for pings or client messages
    ws.on('message', (data) => {
      // Echo pings or ignore
      try {
        const { type } = JSON.parse(data.toString());
        if (type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', data: Date.now() }));
        }
      } catch (_) {}
    });

    // Send a connected acknowledgment
    ws.send(JSON.stringify({ type: 'connection', data: { connected: true } }));
  });

  // Define the actual send helper now that we have wss
  sendToUser = (userId, type, data) => {
    const sockets = userSockets.get(userId);
    if (!sockets) return;
    const payload = JSON.stringify({ type, data });
    sockets.forEach((socket) => {
      if (socket.readyState === socket.OPEN) {
        socket.send(payload);
      }
    });
  };

  logger.info('🔌 WebSocket server initialised');
}

module.exports = {
  setupWebSocket,
  /**
   * Send a message to a particular authenticated user.
   * Safe no-op if the user has no active sockets.
   */
  sendToUser: (...args) => sendToUser(...args)
}; 