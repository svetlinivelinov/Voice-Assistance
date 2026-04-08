function createSessionStore() {
  const sessions = new Map();

  function get(sessionId) {
    return sessions.get(sessionId) || null;
  }

  function upsert(sessionId, updater) {
    const previous = sessions.get(sessionId) || null;
    const next = updater(previous);
    sessions.set(sessionId, next);
    return next;
  }

  return {
    get,
    upsert
  };
}

module.exports = {
  createSessionStore
};
