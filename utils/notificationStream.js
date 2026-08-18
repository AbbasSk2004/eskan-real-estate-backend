const clients = new Map();

const getClientSet = (userId) => clients.get(String(userId));

const addClient = (userId, res) => {
  const key = String(userId);
  if (!clients.has(key)) {
    clients.set(key, new Set());
  }

  clients.get(key).add(res);
};

const removeClient = (userId, res) => {
  const key = String(userId);
  const set = clients.get(key);
  if (!set) {
    return;
  }

  set.delete(res);
  if (set.size === 0) {
    clients.delete(key);
  }
};

const broadcastToUser = (userId, payload) => {
  const set = getClientSet(userId);
  if (!set || set.size === 0) {
    return;
  }

  const message = `data: ${JSON.stringify(payload)}\n\n`;

  set.forEach((res) => {
    try {
      res.write(message);
    } catch (err) {
      removeClient(userId, res);
    }
  });
};

module.exports = {
  addClient,
  removeClient,
  broadcastToUser
};
