function createCallSessionStore() {
  const sessions = new Map();

  function get(callControlId) {
    return sessions.get(callControlId) || null;
  }

  function upsert(callControlId, updater) {
    const previous = sessions.get(callControlId) || null;
    const next = updater(previous);
    sessions.set(callControlId, next);
    return next;
  }

  return {
    get,
    upsert
  };
}

module.exports = {
  createCallSessionStore
};