const { Server } = require('ws');
const url = require('url');
const authService = require('./services/auth.service');
const User = require('./models/user.model');

// In-module variable so other modules can import sendToUser even before setup runs
let sendToUser = () => {};

/**
 * Authenticate an access-token (JWT) using the backend auth service.
 * Defined outside setupWebSocket so it can be used in the upgrade handler.
 * @param {string} token
 * @returns {Promise<string|null>} user id or null if invalid
 */
const authenticate = async (token) => {
  if (!token) return null;
  try {
    const payload = authService.verifyAccessToken(token);
    if (!payload?.sub) return null;

    // Ensure user still exists and is active
    const user = await User.findById(payload.sub);
    if (!user) return null;

    return user._id;
  } catch (err) {
    console.error('WebSocket auth error:', err);
    return null;
  }
};

function setupWebSocket(server) {
  // Use noServer mode so we control the upgrade path explicitly.
  // This prevents Express middleware (helmet, morgan, etc.) from
  // intercepting WebSocket upgrade requests as regular HTTP GETs.
  const wss = new Server({ noServer: true });

  // Map<userId, Set<ws>>
  const userSockets = new Map();

  // Handle HTTP upgrade requests BEFORE Express can respond
  server.on('upgrade', async (req, socket, head) => {
    const { pathname, query } = url.parse(req.url, true);

    // Only accept upgrades on the /ws path
    if (pathname !== '/ws') {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }

    // Authenticate via ?token= query parameter
    const userId = await authenticate(query.token);
    if (!userId) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    // Complete the WebSocket upgrade
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.userId = userId;
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws, req) => {
    const userId = ws.userId;

    // Store socket
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId).add(ws);
    console.log(`WebSocket connected: ${userId}`);

    ws.on('close', () => {
      const set = userSockets.get(userId);
      if (set) {
        set.delete(ws);
        if (set.size === 0) userSockets.delete(userId);
      }
      console.log(`WebSocket disconnected: ${userId}`);
    });

    // Listen for pings or client messages
    ws.on('message', (data) => {
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

  console.log('🔌 WebSocket server initialised (path: /ws)');
}

module.exports = {
  setupWebSocket,
  /**
   * Send a message to a particular authenticated user.
   * Safe no-op if the user has no active sockets.
   */
  sendToUser: (...args) => sendToUser(...args)
};