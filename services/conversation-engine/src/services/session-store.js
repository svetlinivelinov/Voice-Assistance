function createSessionStore() {
  const sessions = new Map();
  const feedbackBySessionId = new Map();

  function get(sessionId) {
    return sessions.get(sessionId) || null;
  }

  function upsert(sessionId, updater) {
    const previous = sessions.get(sessionId) || null;
    const next = updater(previous);
    sessions.set(sessionId, next);
    return next;
  }

  function setFeedback(sessionId, feedback) {
    feedbackBySessionId.set(sessionId, {
      ...feedback,
      timestamp: new Date().toISOString()
    });
    return feedbackBySessionId.get(sessionId);
  }

  function getFeedback(sessionId) {
    return feedbackBySessionId.get(sessionId) || null;
  }

  return {
    get,
    upsert,
    setFeedback,
    getFeedback
  };
}

module.exports = {
  createSessionStore
};
