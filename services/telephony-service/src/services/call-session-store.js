function createCallSessionStore() {
  const sessions = new Map();
  const processedEventIds = new Set();

  function get(callControlId) {
    return sessions.get(callControlId) || null;
  }

  function upsert(callControlId, updater) {
    const previous = sessions.get(callControlId) || null;
    const next = updater(previous);
    sessions.set(callControlId, next);
    return next;
  }

  function hasProcessed(eventId) {
    return processedEventIds.has(eventId);
  }

  function markProcessed(eventId) {
    processedEventIds.add(eventId);
  }

  return {
    get,
    upsert,
    hasProcessed,
    markProcessed
  };
}

module.exports = {
  createCallSessionStore
};