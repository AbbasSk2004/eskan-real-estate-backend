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

    // Ensure user still exists
    const user = await User.findById(payload.sub);
    if (!user) return null;

    return user._id;
  } catch (err) {
    console.error('WebSocket auth error:', err);
    return null;
  }
};

// Extract candidate access tokens from the query param (legacy) or the
// HttpOnly cookies (current clients — the browser sends them automatically
// on the WebSocket handshake for the backend origin). Both cookie names are
// tried: a stale cookie from the other scope or an older secret must never
// shadow a valid one, so authenticate() tries each candidate in turn.
const getTokenCandidates = (req) => {
  const { query } = url.parse(req.url, true);
  const candidates = [];
  if (query.token) candidates.push(query.token);
  const cookieHeader = req.headers.cookie || '';
  const matches = /(?:^|;\s*)(token|admin_token)=([^;]+)/g;
  let match;
  while ((match = matches.exec(cookieHeader)) !== null) {
    candidates.push(decodeURIComponent(match[2]));
  }
  return candidates;
};

// First candidate that verifies wins.
const authenticateAny = async (candidates) => {
  for (const token of candidates) {
    const userId = await authenticate(token);
    if (userId) return userId;
  }
  return null;
};

// Presence is server-observed: the socket registry is the only thing that
// actually knows who is connected, so it — not the client — is authoritative.
// updateOne (not doc.save()) keeps this a single atomic field write that cannot
// clobber a concurrent profile update; `status` is a hardcoded literal here, so
// skipping enum validation is safe.
const markPresence = async (userId, status) => {
  try {
    await User.updateOne(
      { _id: userId },
      { $set: { status, lastSeenAt: new Date() } }
    );
  } catch (err) {
    console.error('Presence update failed', err);
  }
};

// A connection that is open but quiet must not decay to "offline", so refresh
// every connected user on a timer. One bulk write covers all of them, which is
// far cheaper than writing on each inbound ping.
const PRESENCE_REFRESH_MS = 60 * 1000;

function setupWebSocket(server) {
  // Use noServer mode so we control the upgrade path explicitly.
  // This prevents Express middleware (helmet, morgan, etc.) from
  // intercepting WebSocket upgrade requests as regular HTTP GETs.
  const wss = new Server({ noServer: true });

  // Map<userId, Set<ws>>
  const userSockets = new Map();

  // Handle HTTP upgrade requests BEFORE Express can respond
  server.on('upgrade', async (req, socket, head) => {
    const { pathname } = url.parse(req.url, true);

    // Only accept upgrades on the /ws path
    if (pathname !== '/ws') {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }

    // Authenticate via ?token= query parameter or HttpOnly cookie
    const userId = await authenticateAny(getTokenCandidates(req));
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
    markPresence(userId, 'active');
    console.log(`WebSocket connected: ${userId}`);

    ws.on('close', () => {
      const set = userSockets.get(userId);
      if (set) {
        set.delete(ws);
        // Only the LAST socket closing means the user actually left — a second
        // tab or a page navigation must not mark them offline.
        if (set.size === 0) {
          userSockets.delete(userId);
          markPresence(userId, 'inactive');
        }
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

  // Keep every still-connected user fresh so `lastSeenAt` only goes stale when
  // the connection is genuinely gone (crash, restart, dropped network).
  const refreshTimer = setInterval(async () => {
    const userIds = [...userSockets.keys()];
    if (userIds.length === 0) return;
    try {
      await User.updateMany(
        { _id: { $in: userIds } },
        { $set: { status: 'active', lastSeenAt: new Date() } }
      );
    } catch (err) {
      console.error('Presence refresh failed', err);
    }
  }, PRESENCE_REFRESH_MS);
  // Never hold the process open just for the presence sweep.
  if (typeof refreshTimer.unref === 'function') refreshTimer.unref();

  server.on('close', () => clearInterval(refreshTimer));

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