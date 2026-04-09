const fs = require('fs');
const path = require('path');

function createPendingLeadQueue(options = {}) {
  const persistEnabled = Boolean(options.persistEnabled);
  const persistFilePath = options.persistFilePath || path.resolve(process.cwd(), 'data', 'telephony-pending-leads.json');

  const itemsByClientId = new Map();

  function persistToDisk() {
    if (!persistEnabled) {
      return;
    }

    const data = JSON.stringify(Array.from(itemsByClientId.values()), null, 2);
    fs.mkdirSync(path.dirname(persistFilePath), { recursive: true });
    fs.writeFileSync(persistFilePath, data, 'utf8');
  }

  function loadFromDisk() {
    if (!persistEnabled || !fs.existsSync(persistFilePath)) {
      return;
    }

    try {
      const raw = fs.readFileSync(persistFilePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return;
      }

      for (const item of parsed) {
        const clientId = item?.lead?.client_id;
        if (!clientId) {
          continue;
        }
        itemsByClientId.set(clientId, item);
      }
    } catch (_error) {
      // Ignore malformed persisted files and continue with an empty queue.
    }
  }

  loadFromDisk();

  function enqueue({ lead, reason, requestId }) {
    if (!lead?.client_id) {
      return null;
    }

    const existing = itemsByClientId.get(lead.client_id);
    const now = new Date().toISOString();

    if (existing) {
      const updated = {
        ...existing,
        lead: {
          ...existing.lead,
          ...lead
        },
        lastError: reason,
        lastRequestId: requestId,
        attempts: (existing.attempts || 0) + 1,
        updatedAt: now
      };
      itemsByClientId.set(lead.client_id, updated);
      persistToDisk();
      return updated;
    }

    const created = {
      lead,
      lastError: reason,
      lastRequestId: requestId,
      attempts: 1,
      createdAt: now,
      updatedAt: now
    };
    itemsByClientId.set(lead.client_id, created);
    persistToDisk();
    return created;
  }

  function list() {
    return Array.from(itemsByClientId.values());
  }

  function size() {
    return itemsByClientId.size;
  }

  async function replay({ replayFn, requestId, maxItems = 20 }) {
    const queued = Array.from(itemsByClientId.entries()).slice(0, Math.max(1, maxItems));

    let replayedCount = 0;
    let failedCount = 0;

    for (const [clientId, item] of queued) {
      try {
        await replayFn(item.lead, requestId);
        itemsByClientId.delete(clientId);
        persistToDisk();
        replayedCount += 1;
      } catch (error) {
        failedCount += 1;
        const now = new Date().toISOString();
        itemsByClientId.set(clientId, {
          ...item,
          lastError: error.message,
          lastRequestId: requestId,
          attempts: (item.attempts || 0) + 1,
          updatedAt: now
        });
        persistToDisk();
      }
    }

    return {
      replayed_count: replayedCount,
      failed_count: failedCount,
      remaining_count: itemsByClientId.size
    };
  }

  return {
    enqueue,
    list,
    size,
    replay
  };
}

module.exports = {
  createPendingLeadQueue
};
